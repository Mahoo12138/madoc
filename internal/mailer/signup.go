package mailer

// SignupSender renders the one message public registration produces.
//
// It lives in the mailer package rather than in the site store so the
// registration flow can depend on a two-method interface and never learn how
// mail leaves the process — or what a message to a stranger should read like.
type SignupSender struct {
	Sender Sender
}

// SignupLinkPath is where a verification link points on the public site. It has
// to match the frontend route: the mail is the only thing that ever hands a
// person their token.
const SignupLinkPath = "/sign-up/"

// SendSignupVerification delivers the link that lets one person finish creating
// their own account.
//
// The wording is deliberately careful. The sender is anonymous by definition, so
// the message cannot claim to know who asked — and it must state plainly that
// ignoring it creates nothing. A stranger receiving this at an address they own
// is exactly the case where being reassuring instead of neutral would be the
// difference between a useful notice and a convincing lie.
func (s SignupSender) SendSignupVerification(to, link string) error {
	if s.Sender == nil {
		return nil
	}
	return s.Sender.Send(Message{
		To:      to,
		Subject: "完成你的 Madoc 注册",
		Text: "你好，\n\n" +
			"有人请求用这个邮箱在 Madoc 创建账号。如果是你本人，打开下面的链接设置姓名和密码即可完成注册：\n\n" +
			link + "\n\n" +
			"链接 30 分钟内有效，且只能使用一次。\n" +
			"如果这不是你发起的操作，请忽略这封邮件——不会有任何账号被创建。\n",
	})
}
