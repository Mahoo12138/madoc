package site

import "testing"

func TestRegistrationPolicies(t *testing.T) {
	tests := []struct {
		name          string
		mode          string
		admin         bool
		ownerInvites  bool
		wantModeOpen  bool
		wantCanInvite bool
	}{
		{name: "closed owner", mode: "closed", ownerInvites: true},
		{name: "closed administrator", mode: "closed", admin: true, ownerInvites: true},
		{name: "invite only regular owner without switch", mode: "invite_only", wantModeOpen: true},
		{name: "invite only administrator without switch", mode: "invite_only", admin: true, wantModeOpen: true, wantCanInvite: true},
		{name: "invite only regular owner with switch", mode: "invite_only", ownerInvites: true, wantModeOpen: true, wantCanInvite: true},
		{name: "open regular owner without switch", mode: "open", wantModeOpen: true},
		{name: "unknown mode fails closed", mode: ""},
		{name: "zero settings fail closed"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			settings := Settings{RegistrationMode: test.mode, AllowWorkspaceOwnerInviteNewUsers: test.ownerInvites}
			if got := RegistrationAllowsNewAccount(settings); got != test.wantModeOpen {
				t.Fatalf("RegistrationAllowsNewAccount() = %v, want %v", got, test.wantModeOpen)
			}
			if got := CanInviteNewUser(settings, test.admin); got != test.wantCanInvite {
				t.Fatalf("CanInviteNewUser() = %v, want %v", got, test.wantCanInvite)
			}
		})
	}
}

func TestCapabilityPolicies(t *testing.T) {
	tests := []struct {
		name   string
		actor  Actor
		manage bool
		create bool
	}{
		{name: "missing actor", actor: Actor{}, manage: false, create: false},
		{name: "regular without grant", actor: Actor{ID: "u"}, manage: false, create: false},
		{name: "regular with grant", actor: Actor{ID: "u", CanCreateWorkspace: true}, manage: false, create: true},
		{name: "admin overrides grant", actor: Actor{ID: "u", IsAdmin: true}, manage: true, create: true},
		{name: "disabled admin", actor: Actor{ID: "u", IsAdmin: true, CanCreateWorkspace: true, Disabled: true}, manage: false, create: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := CanManageSite(test.actor); got != test.manage {
				t.Fatalf("CanManageSite() = %v, want %v", got, test.manage)
			}
			if got := CanCreateWorkspace(test.actor); got != test.create {
				t.Fatalf("CanCreateWorkspace() = %v, want %v", got, test.create)
			}
		})
	}
}
