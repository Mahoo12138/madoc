package site

import "testing"

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
