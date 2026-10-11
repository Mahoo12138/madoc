package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"madoc/internal/site"
)

// auditFixture reuses the admin users fixture: the audit rows written by user
// management are the most realistic input for the read path, so the tests below
// drive real management writes instead of hand-crafted rows wherever they can.
type auditFixture struct {
	*adminUsersFixture
}

// insertAuditRow writes one audit row directly, for the cases a real management
// write cannot produce: a deleted actor, a malformed change document, and rows
// whose relative order the cursor has to respect.
func (f *auditFixture) insertAuditRow(action, targetType, targetID, changes string, at time.Time) int64 {
	f.t.Helper()
	result, err := f.db.Exec(`INSERT INTO admin_audit_events(actor_kind,actor_user_id,action,target_type,target_id,changes_json,request_id,created_at) VALUES('user',?,?,?,?,?,NULL,?)`,
		f.adminID, action, targetType, targetID, changes, at.UTC())
	if err != nil {
		f.t.Fatal(err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		f.t.Fatal(err)
	}
	return id
}

func (f *auditFixture) listEvents(query string) auditEventsResponse {
	f.t.Helper()
	response := f.request(http.MethodGet, "/admin/audit-events"+query, "", f.adminSession, false)
	if response.Code != http.StatusOK {
		f.t.Fatalf("list status=%d body=%s", response.Code, response.Body.String())
	}
	var payload auditEventsResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		f.t.Fatal(err)
	}
	return payload
}

func actionNames(events []site.AuditEvent) []string {
	names := make([]string, 0, len(events))
	for _, event := range events {
		names = append(names, event.Action)
	}
	return names
}

// TestAuditEventsReadRealManagementWrites proves the read path describes what
// the write side actually produced: newest first, actor name resolved, and the
// business before/after values decoded into a map the page can render.
func TestAuditEventsReadRealManagementWrites(t *testing.T) {
	fixture := &auditFixture{newAdminUsersFixture(t)}
	target := fixture.addUser("协作者", "member@example.test", false, "2026-01-01T00:00:00Z")

	if response := fixture.patchUser(target, 0, `{"disabled":true}`); response.Code != http.StatusOK {
		t.Fatalf("disable status=%d body=%s", response.Code, response.Body.String())
	}
	if response := fixture.patchUser(target, 1, `{"disabled":false}`); response.Code != http.StatusOK {
		t.Fatalf("enable status=%d body=%s", response.Code, response.Body.String())
	}
	if response := fixture.patchUser(target, 2, `{"canCreateWorkspace":true}`); response.Code != http.StatusOK {
		t.Fatalf("grant status=%d body=%s", response.Code, response.Body.String())
	}

	payload := fixture.listEvents("")
	if len(payload.Events) != 3 {
		t.Fatalf("events = %d, want 3: %#v", len(payload.Events), payload.Events)
	}
	if payload.NextBefore != nil {
		t.Fatalf("nextBefore = %q on the last page", *payload.NextBefore)
	}
	// Ordering is id DESC: the later write comes first.
	for index := 1; index < len(payload.Events); index++ {
		if payload.Events[index-1].ID <= payload.Events[index].ID {
			t.Fatalf("events are not newest first: %v", actionNames(payload.Events))
		}
	}
	newest, oldest := payload.Events[0], payload.Events[2]
	if newest.Action != site.ActionUserWorkspaceCreationChanged || oldest.Action != site.ActionUserDisabled {
		t.Fatalf("actions = %v", actionNames(payload.Events))
	}
	for _, event := range payload.Events {
		if event.ActorName != "Admin" {
			t.Fatalf("actorName = %q, want the operator's name", event.ActorName)
		}
		if event.ActorID == nil || *event.ActorID != fixture.adminID {
			t.Fatalf("actorId = %v", event.ActorID)
		}
		if event.TargetType != "user" || event.TargetID == nil || *event.TargetID != target {
			t.Fatalf("target = %q/%v", event.TargetType, event.TargetID)
		}
		if event.CreatedAt == "" {
			t.Fatalf("createdAt is empty: %#v", event)
		}
	}
	change, ok := newest.Changes[site.KeyUserCanCreateWorkspace].(map[string]any)
	if !ok {
		t.Fatalf("changes = %#v", newest.Changes)
	}
	if change["from"] != false || change["to"] != true {
		t.Fatalf("canCreateWorkspace change = %#v", change)
	}
	if _, exposed := newest.Changes["password"]; exposed {
		t.Fatalf("changes leaked a non-whitelisted field: %#v", newest.Changes)
	}
}

// TestAuditEventsCursorPagesWithoutRepeatingOrSkipping pins the keyset cursor:
// the second page must continue strictly before the smallest id of the first,
// so no row is repeated and none is skipped.
func TestAuditEventsCursorPagesWithoutRepeatingOrSkipping(t *testing.T) {
	fixture := &auditFixture{newAdminUsersFixture(t)}
	base := time.Date(2026, 3, 1, 8, 0, 0, 0, time.UTC)
	inserted := make([]int64, 0, 5)
	for index := 0; index < 5; index++ {
		inserted = append(inserted, fixture.insertAuditRow(site.ActionUserEnabled, "user", "user-"+string(rune('a'+index)), `{"disabled":{"from":true,"to":false}}`, base.Add(time.Duration(index)*time.Minute)))
	}

	first := fixture.listEvents("?limit=2")
	if len(first.Events) != 2 || first.NextBefore == nil {
		t.Fatalf("first page = %#v", first)
	}
	if first.Events[0].ID != inserted[4] || first.Events[1].ID != inserted[3] {
		t.Fatalf("first page ids = %d,%d want %d,%d", first.Events[0].ID, first.Events[1].ID, inserted[4], inserted[3])
	}

	second := fixture.listEvents("?limit=2&before=" + *first.NextBefore)
	if len(second.Events) != 2 || second.NextBefore == nil {
		t.Fatalf("second page = %#v", second)
	}
	if second.Events[0].ID != inserted[2] || second.Events[1].ID != inserted[1] {
		t.Fatalf("second page ids = %d,%d want %d,%d", second.Events[0].ID, second.Events[1].ID, inserted[2], inserted[1])
	}

	last := fixture.listEvents("?limit=2&before=" + *second.NextBefore)
	if len(last.Events) != 1 || last.NextBefore != nil {
		t.Fatalf("last page = %#v", last)
	}
	if last.Events[0].ID != inserted[0] {
		t.Fatalf("last page id = %d, want %d", last.Events[0].ID, inserted[0])
	}

	// The pages together cover every row exactly once.
	seen := map[int64]int{}
	for _, page := range []auditEventsResponse{first, second, last} {
		for _, event := range page.Events {
			seen[event.ID]++
		}
	}
	for _, id := range inserted {
		if seen[id] != 1 {
			t.Fatalf("row %d appeared %d times across pages", id, seen[id])
		}
	}
}

// TestAuditEventsRejectValuesOutsideTheWhitelist proves the filters are checked
// against the server-owned list instead of being ignored: a value that is not
// whitelisted must be a 400, never a silently unfiltered page. It also proves
// no client text reaches SQL — a quote-laden value is rejected before it can be
// interpreted.
func TestAuditEventsRejectValuesOutsideTheWhitelist(t *testing.T) {
	fixture := &auditFixture{newAdminUsersFixture(t)}
	fixture.insertAuditRow(site.ActionUserDisabled, "user", "user-a", `{"disabled":{"from":false,"to":true}}`, time.Now().UTC())

	for _, query := range []struct{ name, value string }{
		{"unknown action", "action=drop%20table"},
		{"action from another namespace", "action=workspace.renamed"},
		{"sql in action", "action=user.disabled%27%20OR%201%3D1--"},
		{"unknown target type", "targetType=workspace"},
		{"sql in target type", "targetType=user%27%3B--"},
		{"negative limit", "limit=0"},
		{"oversized limit", "limit=101"},
		{"non numeric limit", "limit=many"},
		{"non numeric cursor", "before=latest"},
		{"zero cursor", "before=0"},
		{"negative cursor", "before=-3"},
		{"sql in cursor", "before=1%20OR%201%3D1"},
	} {
		t.Run(query.name, func(t *testing.T) {
			response := fixture.request(http.MethodGet, "/admin/audit-events?"+query.value, "", fixture.adminSession, false)
			assertAPIError(t, response, http.StatusBadRequest, "INVALID_REQUEST")
		})
	}

	// Every whitelisted action and target type is accepted, and the table is
	// still readable afterwards: a rejected filter must not corrupt anything.
	for _, action := range []string{
		site.ActionSettingsChanged,
		site.ActionUserDisabled,
		site.ActionUserEnabled,
		site.ActionUserAdminRoleChanged,
		site.ActionUserWorkspaceCreationChanged,
		site.ActionUserSessionsRevoked,
	} {
		response := fixture.request(http.MethodGet, "/admin/audit-events?action="+action, "", fixture.adminSession, false)
		if response.Code != http.StatusOK {
			t.Fatalf("action %q status=%d body=%s", action, response.Code, response.Body.String())
		}
	}
	for _, targetType := range []string{"site_settings", "user"} {
		response := fixture.request(http.MethodGet, "/admin/audit-events?targetType="+targetType, "", fixture.adminSession, false)
		if response.Code != http.StatusOK {
			t.Fatalf("targetType %q status=%d body=%s", targetType, response.Code, response.Body.String())
		}
	}
	var rows int
	if err := fixture.db.QueryRow(`SELECT count(*) FROM admin_audit_events`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 1 {
		t.Fatalf("audit rows after rejected filters = %d", rows)
	}
}

// TestAuditEventsFilterNarrowTheList proves the filters actually narrow: a page
// filtered to one action must not carry the other action's rows.
func TestAuditEventsFilterNarrowTheList(t *testing.T) {
	fixture := &auditFixture{newAdminUsersFixture(t)}
	at := time.Date(2026, 4, 2, 9, 0, 0, 0, time.UTC)
	fixture.insertAuditRow(site.ActionUserDisabled, "user", "user-a", `{"disabled":{"from":false,"to":true}}`, at)
	fixture.insertAuditRow(site.ActionSettingsChanged, "site_settings", "site_settings", `{"inviteDefaultCanCreateWorkspace":{"from":true,"to":false}}`, at.Add(time.Minute))
	fixture.insertAuditRow(site.ActionUserSessionsRevoked, "user", "user-a", `{"sessionsRevoked":2}`, at.Add(2*time.Minute))

	disabled := fixture.listEvents("?action=" + site.ActionUserDisabled)
	if names := actionNames(disabled.Events); len(names) != 1 || names[0] != site.ActionUserDisabled {
		t.Fatalf("action filter returned %v", names)
	}
	settings := fixture.listEvents("?targetType=site_settings")
	if len(settings.Events) != 1 || settings.Events[0].Action != site.ActionSettingsChanged {
		t.Fatalf("targetType filter returned %v", actionNames(settings.Events))
	}
	if settings.Events[0].Changes[site.KeyInviteDefaultCanCreateWorkspace] == nil {
		t.Fatalf("settings changes = %#v", settings.Events[0].Changes)
	}
	users := fixture.listEvents("?targetType=user")
	if len(users.Events) != 2 {
		t.Fatalf("user target filter returned %d rows", len(users.Events))
	}
	byID := fixture.listEvents("?targetId=user-a")
	if len(byID.Events) != 2 {
		t.Fatalf("targetId filter returned %d rows", len(byID.Events))
	}
	none := fixture.listEvents("?targetId=user-missing")
	if len(none.Events) != 0 || none.NextBefore != nil {
		t.Fatalf("unmatched targetId = %#v", none)
	}
}

// TestAuditEventsRequireAnActiveAdministrator proves the middleware verdict is
// not cosmetic: an anonymous caller gets 401 and a non-administrator gets 403,
// and neither sees a single audit row.
func TestAuditEventsRequireAnActiveAdministrator(t *testing.T) {
	fixture := &auditFixture{newAdminUsersFixture(t)}
	target := fixture.addUser("协作者", "member@example.test", false, "2026-01-01T00:00:00Z")

	// A live session whose rows are gone: the request still carries an
	// authenticated-looking cookie, and the session must not resolve.
	revokedSession := fixture.sessionFor(target)
	if _, err := fixture.identity.Resolve(context.Background(), revokedSession); err != nil {
		t.Fatalf("session should resolve before it is revoked: %v", err)
	}
	if _, err := fixture.db.Exec(`DELETE FROM sessions WHERE user_id=?`, target); err != nil {
		t.Fatal(err)
	}
	if response := fixture.patchUser(target, 0, `{"disabled":true}`); response.Code != http.StatusOK {
		t.Fatalf("disable status=%d body=%s", response.Code, response.Body.String())
	}

	assertAPIError(t, fixture.request(http.MethodGet, "/admin/audit-events", "", "", false), http.StatusUnauthorized, "UNAUTHORIZED")
	assertAPIError(t, fixture.request(http.MethodGet, "/admin/audit-events", "", revokedSession, false), http.StatusUnauthorized, "UNAUTHORIZED")

	other := fixture.addUser("Member", "outsider@example.test", false, "2026-01-01T00:00:00Z")
	forbidden := fixture.request(http.MethodGet, "/admin/audit-events", "", fixture.sessionFor(other), false)
	assertAPIError(t, forbidden, http.StatusForbidden, "ADMIN_REQUIRED")
	if body := forbidden.Body.String(); containsAuditContent(body) {
		t.Fatalf("refusal leaked audit content: %s", body)
	}

	// A second administrator reads the trail fine...
	admin := fixture.addUser("Second Admin", "second@example.test", true, "2026-01-01T00:00:00Z")
	secondSession := fixture.sessionFor(admin)
	if ok := fixture.request(http.MethodGet, "/admin/audit-events", "", secondSession, false); ok.Code != http.StatusOK {
		t.Fatalf("second admin status=%d body=%s", ok.Code, ok.Body.String())
	}
	// ...and loses it the moment the account is disabled. `Resolve` refuses a
	// disabled account, so the verdict is 401 at `Require` rather than 403 at
	// `adminRequired` — the same contract the user list has.
	if _, err := fixture.db.Exec(`UPDATE users SET disabled=1 WHERE id=?`, admin); err != nil {
		t.Fatal(err)
	}
	disabled := fixture.request(http.MethodGet, "/admin/audit-events", "", secondSession, false)
	assertAPIError(t, disabled, http.StatusUnauthorized, "UNAUTHORIZED")
	if body := disabled.Body.String(); containsAuditContent(body) {
		t.Fatalf("refusal leaked audit content: %s", body)
	}
}

// containsAuditContent keeps the refusal assertion honest: a 403 body must not
// carry the events array, and must not echo a raw action name back either.
func containsAuditContent(body string) bool {
	for _, marker := range []string{`"events"`, site.ActionUserDisabled, "changes"} {
		if strings.Contains(body, marker) {
			return true
		}
	}
	return false
}

// TestAuditEventsTolerateADeletedActor covers the `ON DELETE SET NULL` foreign
// key: once the operator's account is gone the row must still be listed, with
// the actor fields empty rather than the whole read failing.
func TestAuditEventsTolerateADeletedActor(t *testing.T) {
	fixture := &auditFixture{newAdminUsersFixture(t)}
	actor := fixture.addUser("临时管理员", "temp-admin@example.test", true, "2026-01-01T00:00:00Z")
	fixture.insertAuditRow(site.ActionUserDisabled, "user", "someone", `{"disabled":{"from":false,"to":true}}`, time.Now().UTC())

	if _, err := fixture.db.Exec(`INSERT INTO admin_audit_events(actor_kind,actor_user_id,action,target_type,target_id,changes_json,request_id,created_at) VALUES('user',?,?,'user','someone','{}',NULL,?)`,
		actor, site.ActionUserEnabled, time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.db.Exec(`UPDATE users SET is_admin=0 WHERE id=?`, actor); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.db.Exec(`DELETE FROM users WHERE id=?`, actor); err != nil {
		t.Fatal(err)
	}

	payload := fixture.listEvents("")
	if len(payload.Events) != 2 {
		t.Fatalf("events = %d, want 2: %#v", len(payload.Events), payload.Events)
	}
	var deleted, kept int
	for _, event := range payload.Events {
		if event.ActorID == nil {
			deleted++
			if event.ActorName != "" {
				t.Fatalf("deleted actor name = %q, want empty", event.ActorName)
			}
			continue
		}
		kept++
		if event.ActorName != "Admin" {
			t.Fatalf("surviving actor name = %q", event.ActorName)
		}
	}
	if deleted != 1 || kept != 1 {
		t.Fatalf("deleted=%d kept=%d", deleted, kept)
	}
}

// TestAuditEventsSurviveADamagedChangesDocument proves the read-only page is not
// taken down by one bad row: an unreadable or null change document degrades to
// an empty object, is reported on the server log, and leaves the other rows
// readable.
func TestAuditEventsSurviveADamagedChangesDocument(t *testing.T) {
	fixture := &auditFixture{newAdminUsersFixture(t)}
	fixture.insertAuditRow(site.ActionUserDisabled, "user", "user-a", `{"disabled":{"from":false,"to":true}}`, time.Now().UTC())
	fixture.insertAuditRow(site.ActionUserEnabled, "user", "user-b", `{"disabled":`, time.Now().UTC())
	fixture.insertAuditRow(site.ActionUserSessionsRevoked, "user", "user-c", `null`, time.Now().UTC())
	fixture.insertAuditRow(site.ActionUserAdminRoleChanged, "user", "user-d", ``, time.Now().UTC())

	payload := fixture.listEvents("")
	if len(payload.Events) != 4 {
		t.Fatalf("events = %d, want 4: %#v", len(payload.Events), payload.Events)
	}
	for _, event := range payload.Events {
		if event.Changes == nil {
			t.Fatalf("event %d has nil changes, which would serialise as null", event.ID)
		}
	}
	// The healthy row is still fully decoded.
	if payload.Events[3].Changes[site.KeyUserDisabled] == nil {
		t.Fatalf("healthy row lost its changes: %#v", payload.Events[3].Changes)
	}
}

// TestAuditEventsStayAvailableWhenSettingsAreCorrupt pins the same fail-closed
// boundary the user list holds: the audit trail must not read site_settings, so
// "who disabled that account" keeps working when an unrelated configuration
// document is unreadable.
func TestAuditEventsStayAvailableWhenSettingsAreCorrupt(t *testing.T) {
	fixture := &auditFixture{newAdminUsersFixture(t)}
	target := fixture.addUser("Member", "member@example.test", false, "2026-01-01T00:00:00Z")
	if response := fixture.patchUser(target, 0, `{"disabled":true}`); response.Code != http.StatusOK {
		t.Fatalf("disable status=%d body=%s", response.Code, response.Body.String())
	}
	if _, err := fixture.db.Exec(`UPDATE server_config SET value='{"schemaVersion":9}' WHERE key='site_settings'`); err != nil {
		t.Fatal(err)
	}
	// The settings endpoints themselves must report the corruption rather than
	// silently repairing the administrator's document.
	assertAPIError(t, fixture.request(http.MethodGet, "/admin/settings", "", fixture.adminSession, false), http.StatusInternalServerError, "INTERNAL")

	payload := fixture.listEvents("")
	if len(payload.Events) != 1 || payload.Events[0].Action != site.ActionUserDisabled {
		t.Fatalf("audit events with corrupt settings = %#v", actionNames(payload.Events))
	}
	// Reading the trail must not repair or create the settings document either.
	var raw string
	if err := fixture.db.QueryRow(`SELECT value FROM server_config WHERE key='site_settings'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if raw != `{"schemaVersion":9}` {
		t.Fatalf("reading audit rewrote site_settings: %s", raw)
	}
}

// TestAuditEventsResponseShape pins the transport contract the page depends on:
// `Cache-Control: no-store`, an `events` array (never null) and a
// `nextBefore` cursor that is a JSON string or null.
func TestAuditEventsResponseShape(t *testing.T) {
	fixture := &auditFixture{newAdminUsersFixture(t)}
	fixture.insertAuditRow(site.ActionUserDisabled, "user", "user-a", `{"disabled":{"from":false,"to":true}}`, time.Now().UTC())
	fixture.insertAuditRow(site.ActionUserEnabled, "user", "user-b", `{"disabled":{"from":true,"to":false}}`, time.Now().UTC())

	response := fixture.request(http.MethodGet, "/admin/audit-events?limit=1", "", fixture.adminSession, false)
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
	var raw struct {
		Events     *[]site.AuditEvent `json:"events"`
		NextBefore *string            `json:"nextBefore"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &raw); err != nil {
		t.Fatal(err)
	}
	if raw.Events == nil || len(*raw.Events) != 1 {
		t.Fatalf("events = %v", raw.Events)
	}
	if raw.NextBefore == nil || *raw.NextBefore == "" {
		t.Fatalf("nextBefore = %v", raw.NextBefore)
	}
	if body := response.Body.String(); !strings.Contains(body, `"nextBefore":"`) {
		t.Fatalf("nextBefore is not a JSON string: %s", body)
	}

	// An empty table is an empty array with a null cursor, not a 404 and not null.
	empty := &auditFixture{newAdminUsersFixture(t)}
	emptyResponse := empty.request(http.MethodGet, "/admin/audit-events", "", empty.adminSession, false)
	if emptyResponse.Code != http.StatusOK {
		t.Fatalf("empty status=%d body=%s", emptyResponse.Code, emptyResponse.Body.String())
	}
	if body := emptyResponse.Body.String(); !strings.Contains(body, `"events":[]`) || !strings.Contains(body, `"nextBefore":null`) {
		t.Fatalf("empty payload = %s", body)
	}
}

// TestAuditEventsDoNotSelfLock guards the single-connection pool: the read path
// must not open a transaction and then reach back for the global handle.
func TestAuditEventsDoNotSelfLock(t *testing.T) {
	fixture := &auditFixture{newAdminUsersFixture(t)}
	fixture.insertAuditRow(site.ActionUserDisabled, "user", "user-a", `{"disabled":{"from":false,"to":true}}`, time.Now().UTC())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		done <- fixture.requestWithContext(ctx, http.MethodGet, "/admin/audit-events", "", fixture.adminSession, false)
	}()
	select {
	case response := <-done:
		if response.Code != http.StatusOK {
			t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
		}
	case <-time.After(8 * time.Second):
		t.Fatal("audit read self-locked on the single database connection")
	}
}
