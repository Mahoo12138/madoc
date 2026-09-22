package api

// Keep the HTTP/domain boundary explicit: failed mutations never publish an
// invalidation, and the realtime hub is not a dependency of core transactions.
func (a *API) notifyWorkspace(workspaceID string) {
	if notifier, ok := a.rooms.(interface{ NotifyWorkspace(string) }); ok {
		notifier.NotifyWorkspace(workspaceID)
	}
}
