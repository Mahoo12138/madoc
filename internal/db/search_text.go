package db

import (
	"database/sql/driver"
	"modernc.org/sqlite"
	"strings"
)

func init() {
	sqlite.MustRegisterDeterministicScalarFunction("madoc_search_text", 1, func(_ *sqlite.FunctionContext, args []driver.Value) (driver.Value, error) {
		value, _ := args[0].(string)
		return searchText(value), nil
	})
}

// A secondary search representation removes Markdown punctuation escapes. The
// search also checks the original source, preserving literal code/backslash
// queries. This is not an HTML renderer or a full Markdown plain-text parser.
func searchText(source string) string {
	var result strings.Builder
	result.Grow(len(source))
	for i := 0; i < len(source); i++ {
		if source[i] == '\\' && i+1 < len(source) {
			next := source[i+1]
			if (next >= 33 && next <= 47) || (next >= 58 && next <= 64) || (next >= 91 && next <= 96) || (next >= 123 && next <= 126) {
				i++
			}
		}
		result.WriteByte(source[i])
	}
	return result.String()
}
