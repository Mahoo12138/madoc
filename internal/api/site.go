package api

import "net/http"

// siteInfoResponse is the only view of the configuration that anonymous
// visitors get. Every other setting stays server side so that the sign-in and
// invite pages cannot enumerate the invitation policy, the user directory or
// anything about storage and secrets.
type siteInfoResponse struct {
	RegistrationMode            string `json:"registrationMode"`
	PublicRegistrationAvailable bool   `json:"publicRegistrationAvailable"`
}

func (a *API) siteInfo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	// LoadPublic reads without ever inserting a default document: an
	// unauthenticated request must not create stored state, and a missing or
	// broken document has to fail closed instead of advertising that everyone
	// may register.
	settings, err := a.site.LoadPublic(r.Context())
	if err != nil {
		writeSiteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, siteInfoResponse{
		RegistrationMode: settings.RegistrationMode,
		// Public registration ships in a later stage, so no mode can make it
		// available yet. Keeping the field out of the settings document means
		// the day it flips cannot be a silent change to this contract.
		PublicRegistrationAvailable: false,
	})
}
