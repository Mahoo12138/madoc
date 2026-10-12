// Package mailertest provides a minimal in-process SMTP server.
//
// Public registration cannot work without a message actually leaving the
// process, so the tests for that flow need a relay they can point the real
// net/smtp client at. This package is that relay: enough of RFC 5321 to walk a
// complete conversation (greeting, EHLO, AUTH, MAIL, RCPT, DATA, QUIT) and
// hand the accepted message back to the test.
//
// It lives outside _test.go on purpose — several packages need it, and a
// helper duplicated into each of them would drift apart.
package mailertest

import (
	"bufio"
	"fmt"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Delivered is one message the relay accepted.
type Delivered struct {
	From string
	To   string
	Data string
}

// Relay is a minimal SMTP server bound to loopback.
type Relay struct {
	listener net.Listener

	mu        sync.Mutex
	messages  []Delivered
	failAfter int // when > 0, reject the Nth and every later DATA command
	attempts  int
}

// Start listens on loopback and serves until Close is called.
//
// The relay advertises no AUTH extension unless requireAuth is set, and never
// speaks STARTTLS: the flow tests use the `none` transport, which is the
// plaintext path a trusted-network relay would use. TLS itself is the standard
// library's and is covered by its own tests.
func Start(requireAuth bool) (*Relay, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	relay := &Relay{listener: listener}
	go relay.serve(requireAuth)
	return relay, nil
}

// Close stops the relay.
func (r *Relay) Close() error { return r.listener.Close() }

// Addr is the host:port the relay listens on.
func (r *Relay) Addr() string { return r.listener.Addr().String() }

// Host returns the listen host.
func (r *Relay) Host() string {
	host, _, _ := net.SplitHostPort(r.Addr())
	return host
}

// Port returns the listen port.
func (r *Relay) Port() int {
	_, port, _ := net.SplitHostPort(r.Addr())
	value, _ := strconv.Atoi(port)
	return value
}

// FailAfter makes the relay reject the Nth and every later message, so a test
// can prove that a failed delivery leaves nothing usable behind.
func (r *Relay) FailAfter(n int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.failAfter = n
}

// Messages returns every accepted message so far.
func (r *Relay) Messages() []Delivered {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]Delivered(nil), r.messages...)
}

// Last returns the most recently accepted message.
func (r *Relay) Last() (Delivered, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.messages) == 0 {
		return Delivered{}, false
	}
	return r.messages[len(r.messages)-1], true
}

// Attempts counts accepted connections, which is how a test observes that no
// retry loop was entered.
func (r *Relay) Attempts() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.attempts
}

// WaitFor blocks until at least n messages have been accepted, or the timeout
// expires. Delivery is synchronous in these tests, so it normally returns on the
// first poll; the loop only guards against a future asynchronous sender.
func (r *Relay) WaitFor(n int, timeout time.Duration) ([]Delivered, error) {
	deadline := time.Now().Add(timeout)
	for {
		if messages := r.Messages(); len(messages) >= n {
			return messages, nil
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("timed out waiting for %d messages, got %d", n, len(r.Messages()))
		}
		time.Sleep(2 * time.Millisecond)
	}
}

func (r *Relay) serve(requireAuth bool) {
	for {
		conn, err := r.listener.Accept()
		if err != nil {
			return
		}
		go r.session(conn, requireAuth)
	}
}

func (r *Relay) session(conn net.Conn, requireAuth bool) {
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(15 * time.Second))
	r.mu.Lock()
	r.attempts++
	r.mu.Unlock()

	reader := bufio.NewReader(conn)
	writer := bufio.NewWriter(conn)
	write := func(line string) bool {
		if _, err := writer.WriteString(line + "\r\n"); err != nil {
			return false
		}
		return writer.Flush() == nil
	}
	if !write("220 localhost ESMTP madoc-test") {
		return
	}

	var from string
	var recipients []string
	authenticated := !requireAuth
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		command := strings.TrimRight(line, "\r\n")
		switch {
		case hasPrefixFold(command, "EHLO"):
			if !write("250-localhost") {
				return
			}
			if requireAuth && !write("250-AUTH PLAIN LOGIN") {
				return
			}
			if !write("250 SIZE 10485760") {
				return
			}
		case hasPrefixFold(command, "HELO"):
			if !write("250 localhost") {
				return
			}
		case hasPrefixFold(command, "AUTH PLAIN"):
			// PLAIN carries its credentials inline in the same line, so there is
			// nothing left to read: consuming another line here would swallow the
			// command that follows and hang the conversation.
			authenticated = true
			if !write("235 2.7.0 Authentication successful") {
				return
			}
		case hasPrefixFold(command, "AUTH LOGIN"):
			if !write("334 VXNlcm5hbWU6") || readLine(reader) == nil {
				return
			}
			if !write("334 UGFzc3dvcmQ6") || readLine(reader) == nil {
				return
			}
			if !write("235 2.7.0 Authentication successful") {
				return
			}
		case hasPrefixFold(command, "AUTH"):
			if !write("504 5.5.4 Unrecognized authentication type") {
				return
			}
		case hasPrefixFold(command, "MAIL FROM:"):
			from = extractAddress(command)
			if !write("250 2.1.0 Ok") {
				return
			}
		case hasPrefixFold(command, "RCPT TO:"):
			recipients = append(recipients, extractAddress(command))
			if !write("250 2.1.5 Ok") {
				return
			}
		case hasPrefixFold(command, "DATA"):
			if requireAuth && !authenticated {
				if !write("530 5.7.0 Authentication required") {
					return
				}
				continue
			}
			if !write("354 End data with <CR><LF>.<CR><LF>") {
				return
			}
			body, err := readData(reader)
			if err != nil {
				return
			}
			if !r.store(from, recipients, body) {
				if !write("451 4.3.0 Temporary failure, try again later") {
					return
				}
				continue
			}
			if !write("250 2.0.0 Ok: queued") {
				return
			}
		case hasPrefixFold(command, "RSET"):
			from, recipients = "", nil
			if !write("250 2.0.0 Ok") {
				return
			}
		case hasPrefixFold(command, "NOOP"):
			if !write("250 2.0.0 Ok") {
				return
			}
		case hasPrefixFold(command, "QUIT"):
			write("221 2.0.0 Bye")
			return
		default:
			if !write("502 5.5.2 Command not implemented") {
				return
			}
		}
	}
}

func (r *Relay) store(from string, recipients []string, body string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.failAfter > 0 && len(r.messages)+1 >= r.failAfter {
		return false
	}
	r.messages = append(r.messages, Delivered{From: from, To: strings.Join(recipients, ", "), Data: body})
	return true
}

func readLine(reader *bufio.Reader) error {
	_, err := reader.ReadString('\n')
	return err
}

// readData collects everything up to the lone dot terminator, un-stuffing the
// doubled dots the sender inserts for lines that begin with one.
func readData(reader *bufio.Reader) (string, error) {
	var builder strings.Builder
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return "", err
		}
		trimmed := strings.TrimRight(line, "\r\n")
		if trimmed == "." {
			return builder.String(), nil
		}
		builder.WriteString(strings.TrimPrefix(trimmed, ".") + "\n")
	}
}

func hasPrefixFold(command, prefix string) bool {
	return len(command) >= len(prefix) && strings.EqualFold(command[:len(prefix)], prefix)
}

// extractAddress pulls the mailbox out of `MAIL FROM:<a@b>` / `RCPT TO:<a@b>`,
// ignoring any parameters after the address.
func extractAddress(command string) string {
	start := strings.Index(command, "<")
	end := strings.LastIndex(command, ">")
	if start < 0 || end <= start {
		return strings.TrimSpace(command[strings.Index(command, ":")+1:])
	}
	return command[start+1 : end]
}
