package mailer

import (
	"strings"
	"testing"
	"time"

	"madoc/internal/config"
	"madoc/internal/mailer/mailertest"
)

func startRelay(t *testing.T, requireAuth bool) *mailertest.Relay {
	t.Helper()
	relay, err := mailertest.Start(requireAuth)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = relay.Close() })
	return relay
}

func relayConfig(relay *mailertest.Relay, username, password string) config.SMTP {
	return config.SMTP{
		Host:     relay.Host(),
		Port:     relay.Port(),
		From:     "madoc@example.test",
		TLS:      config.TLSNone,
		Username: username,
		Password: password,
	}
}

// TestSMTPDeliversThroughRealConversation walks the whole thing: the real
// net/smtp client against a real socket, because "the mailer was called" is not
// the property that matters — "a verification link actually leaves" is.
func TestSMTPDeliversThroughRealConversation(t *testing.T) {
	relay := startRelay(t, true)
	sender := NewSMTP(relayConfig(relay, "deployer", "secret-password"))
	if sender == nil {
		t.Fatal("a fully configured SMTP settings block must build a sender")
	}
	err := sender.Send(Message{
		To:      "person@example.test",
		Subject: "完成你的 Madoc 注册",
		Text:    "打开这个链接完成注册：\nhttps://madoc.example.test/sign-up/abc.def\n\n如果这不是你发起的操作，请忽略这封邮件。",
	})
	if err != nil {
		t.Fatalf("Send() error = %v", err)
	}
	messages, err := relay.WaitFor(1, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	got := messages[0]
	if got.From != "madoc@example.test" || got.To != "person@example.test" {
		t.Fatalf("envelope = %s -> %s", got.From, got.To)
	}
	for _, want := range []string{
		"To: person@example.test",
		"Subject: 完成你的 Madoc 注册",
		"https://madoc.example.test/sign-up/abc.def",
	} {
		if !strings.Contains(got.Data, want) {
			t.Fatalf("message missing %q:\n%s", want, got.Data)
		}
	}
	if relay.Attempts() != 1 {
		t.Fatalf("connections = %d, want exactly one delivery attempt", relay.Attempts())
	}
}

// TestSMTPAuthenticationIsOptionalButEnforcedByTheRelay pins both halves of the
// AUTH decision: a sender with no credentials completes the conversation
// against a relay that does not demand them, and one that omits AUTH entirely
// cannot be talked past by a sender that has credentials configured.
func TestSMTPAuthenticationIsOptionalButEnforcedByTheRelay(t *testing.T) {
	open := startRelay(t, false)
	if sender := NewSMTP(relayConfig(open, "", "")); sender == nil {
		t.Fatal("credentials are optional: a trusted-network relay needs none")
	} else if err := sender.Send(Message{To: "person@example.test", Subject: "s", Text: "t"}); err != nil {
		t.Fatalf("Send() without credentials against an open relay = %v", err)
	}

	strict := startRelay(t, true)
	err := NewSMTP(relayConfig(strict, "", "")).Send(Message{To: "person@example.test", Subject: "s", Text: "t"})
	if err == nil {
		t.Fatal("a relay that requires AUTH must refuse an unauthenticated delivery")
	}
}

func TestSMTPReportsRelayFailureWithoutLeakingTheLink(t *testing.T) {
	relay := startRelay(t, false)
	relay.FailAfter(1)
	sender := NewSMTP(relayConfig(relay, "", ""))
	err := sender.Send(Message{To: "person@example.test", Subject: "s", Text: "https://madoc.example.test/sign-up/secret-token"})
	if err == nil {
		t.Fatal("a rejected DATA must surface as an error so the flow can withdraw the record")
	}
	if strings.Contains(err.Error(), "secret-token") {
		t.Fatalf("delivery error leaked the verification token: %v", err)
	}
	if !strings.Contains(err.Error(), "person@example.test") {
		t.Fatalf("delivery error should name the recipient for diagnosis: %v", err)
	}
}

func TestNewSMTPReturnsNilWhenNotConfigured(t *testing.T) {
	for name, cfg := range map[string]config.SMTP{
		"empty":     {},
		"no sender": {Host: "smtp.example.test", Port: 587},
		"no host":   {From: "madoc@example.test"},
	} {
		if NewSMTP(cfg) != nil {
			t.Fatalf("%s settings must not produce a transport", name)
		}
	}
}

func TestSendRejectsIncompleteMessages(t *testing.T) {
	relay := startRelay(t, false)
	sender := NewSMTP(relayConfig(relay, "", ""))
	for _, message := range []Message{
		{To: "", Subject: "s", Text: "t"},
		{To: "  ", Subject: "s", Text: "t"},
		{To: "a@example.test", Subject: "", Text: "t"},
	} {
		if err := sender.Send(message); err == nil {
			t.Fatalf("message %+v must be refused before dialing", message)
		}
	}
	if relay.Attempts() != 0 {
		t.Fatalf("invalid messages dialed the relay %d times", relay.Attempts())
	}
}

// TestHeaderInjectionIsStripped pins that a value containing CRLF cannot open a
// new header line. The From address is operator configuration, but the rule is
// asserted on the whole rendered message: an injected Bcc would silently
// exfiltrate every verification link this flow ever sends.
func TestHeaderInjectionIsStripped(t *testing.T) {
	relay := startRelay(t, false)
	sender := NewSMTP(relayConfig(relay, "", ""))
	if err := sender.Send(Message{To: "a@example.test", Subject: "hi\r\nBcc: attacker@example.test", Text: "body"}); err != nil {
		t.Fatal(err)
	}
	messages, err := relay.WaitFor(1, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range strings.Split(messages[0].Data, "\n") {
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(line)), "bcc:") {
			t.Fatalf("header injection survived:\n%s", messages[0].Data)
		}
	}
}

func TestNormalizeBodyEndsWithCRLF(t *testing.T) {
	if got := normalizeBody("line"); got != "line\r\n" {
		t.Fatalf("normalizeBody = %q", got)
	}
	if got := normalizeBody("a\r\nb"); got != "a\r\nb\r\n" {
		t.Fatalf("normalizeBody = %q", got)
	}
	if got := normalizeBody("\n\n"); got != "\r\n" {
		t.Fatalf("normalizeBody of blank body = %q", got)
	}
}
