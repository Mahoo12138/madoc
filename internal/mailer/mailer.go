// Package mailer sends the transactional mail public registration depends on.
//
// It exists as its own package so the registration flow depends on a one-method
// interface rather than on net/smtp: the SMTP details stay out of the flow that
// decides who may create an account, and a test can drive a real conversation
// against a local relay without stubbing out the transport itself.
package mailer

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"

	"madoc/internal/config"
)

// Message is one outbound mail. Only plain text is produced: a verification
// notice is read once by a person deciding whether to trust a link, and an HTML
// alternative would be an unrequested way to ship remote content into that
// decision.
type Message struct {
	To      string
	Subject string
	Text    string
}

// Sender delivers one message. This is the seam the registration flow depends
// on: nothing above it knows whether mail leaves through SMTP, a queue, or a
// test double.
type Sender interface {
	Send(message Message) error
}

// Timeout bounds one delivery attempt. A relay that accepts the connection and
// then stalls must not pin a request — or, worse, a database transaction — open
// indefinitely.
const Timeout = 20 * time.Second

// SMTP is the net/smtp backed Sender used in every real deployment.
type SMTP struct {
	addr        string
	host        string
	username    string
	password    string
	from        string
	tlsMode     string
	authEnabled bool
}

// NewSMTP builds the transport from the deployment configuration. It returns
// nil when the configuration cannot send mail at all, so callers hold readiness
// and transport as one fact instead of re-deriving the same condition twice.
func NewSMTP(cfg config.SMTP) *SMTP {
	if !cfg.Ready() {
		return nil
	}
	return &SMTP{
		addr:        cfg.Addr(),
		host:        cfg.Host,
		username:    cfg.Username,
		password:    cfg.Password,
		from:        cfg.From,
		tlsMode:     cfg.TLS,
		authEnabled: cfg.AuthConfigured(),
	}
}

// Send delivers one message over a fresh connection. Connections are not pooled:
// public registration is a low-volume, latency-insensitive flow, and a pool
// would add a failure mode (a reused session the relay has already closed)
// without buying throughput this instance needs.
func (s *SMTP) Send(message Message) error {
	if strings.TrimSpace(message.To) == "" || strings.TrimSpace(message.Subject) == "" {
		return fmt.Errorf("mailer: recipient and subject are required")
	}
	if err := s.deliver(message); err != nil {
		// The wrapped error is logged for the operator and never returned to an
		// HTTP client. It may name the relay and the recipient, but it must not
		// carry the body: the body is the verification link, and that link is
		// the credential this whole flow exists to protect.
		return fmt.Errorf("send mail to %s: %w", message.To, err)
	}
	return nil
}

func (s *SMTP) deliver(message Message) error {
	conn, err := net.DialTimeout("tcp", s.addr, Timeout)
	if err != nil {
		return err
	}
	defer conn.Close()
	if err := conn.SetDeadline(time.Now().Add(Timeout)); err != nil {
		return err
	}
	if s.tlsMode == config.TLSImplicit {
		// Verification is left at the system roots on purpose: a relay
		// certificate has to validate exactly like any other TLS client's, and
		// relaxing it would let anyone on the path read the token.
		tlsConn := tls.Client(conn, &tls.Config{ServerName: s.host, MinVersion: tls.VersionTLS12})
		if err := tlsConn.Handshake(); err != nil {
			return err
		}
		conn = tlsConn
	}
	client, err := smtp.NewClient(conn, s.host)
	if err != nil {
		return err
	}
	defer client.Close()
	if s.tlsMode == config.TLSStartTLS {
		if err := client.StartTLS(&tls.Config{ServerName: s.host, MinVersion: tls.VersionTLS12}); err != nil {
			return err
		}
	}
	if s.authEnabled {
		if ok, _ := client.Extension("AUTH"); !ok {
			return fmt.Errorf("relay offers no AUTH while credentials are configured")
		}
		if err := client.Auth(smtp.PlainAuth("", s.username, s.password, s.host)); err != nil {
			return err
		}
	}
	if err := client.Mail(s.from); err != nil {
		return err
	}
	if err := client.Rcpt(message.To); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write([]byte(s.render(message))); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}

// render builds the RFC 5322 message. Header values are stripped of CR and LF so
// a value that contains one cannot terminate the header block and append headers
// (a recipient, a BCC) of its own.
func (s *SMTP) render(message Message) string {
	var builder strings.Builder
	fmt.Fprintf(&builder, "From: %s\r\n", sanitizeHeader(s.from))
	fmt.Fprintf(&builder, "To: %s\r\n", sanitizeHeader(message.To))
	fmt.Fprintf(&builder, "Subject: %s\r\n", sanitizeHeader(message.Subject))
	fmt.Fprintf(&builder, "Date: %s\r\n", time.Now().UTC().Format(time.RFC1123Z))
	builder.WriteString("MIME-Version: 1.0\r\n")
	builder.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	builder.WriteString("Content-Transfer-Encoding: 8bit\r\n")
	builder.WriteString("\r\n")
	builder.WriteString(normalizeBody(message.Text))
	return builder.String()
}

func sanitizeHeader(value string) string {
	return strings.NewReplacer("\r", " ", "\n", " ").Replace(value)
}

// normalizeBody rewrites the body to CRLF line endings and guarantees it ends
// with one, so the terminating dot is not glued onto the last line.
func normalizeBody(body string) string {
	body = strings.ReplaceAll(body, "\r\n", "\n")
	body = strings.ReplaceAll(body, "\r", "\n")
	body = strings.TrimRight(body, "\n")
	if body == "" {
		return "\r\n"
	}
	return strings.ReplaceAll(body, "\n", "\r\n") + "\r\n"
}
