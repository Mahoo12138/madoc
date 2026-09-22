package db

import "testing"

func TestSearchTextEscapes(t *testing.T) {
	for _, test := range []struct{ source, want string }{
		{`snake\_case`, `snake_case`},
		{`a\*b\[c\]`, `a*b[c]`},
		{`中文\_短词`, `中文_短词`},
		{`C:\path\file`, `C:\path\file`},
		{`trailing\`, `trailing\`},
		{`a\\_b`, `a\_b`},
	} {
		if got := searchText(test.source); got != test.want {
			t.Fatalf("%q: got %q, want %q", test.source, got, test.want)
		}
	}
}
