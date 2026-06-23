package ws

import "encoding/json"

type Envelope struct {
	Channel string          `json:"channel"`
	Payload json.RawMessage `json:"payload"`
}

type DocPayloadType struct {
	Type string `json:"type"`
}

type DocInitPayload struct {
	Type string `json:"type"`
}

type DocUpdatePayload struct {
	Type    string `json:"type"`
	DocID   string `json:"docId"`
	Updates []int  `json:"updates"`
}

type DocSnapshotRequestPayload struct {
	Type  string `json:"type"`
	DocID string `json:"docId"`
}

type DocSnapshotPayload struct {
	Type     string `json:"type"`
	DocID    string `json:"docId"`
	Snapshot []int  `json:"snapshot"`
}

func bytesToInts(b []byte) []int {
	out := make([]int, len(b))
	for i, v := range b {
		out[i] = int(v)
	}
	return out
}

func intsToBytes(ints []int) []byte {
	out := make([]byte, len(ints))
	for i, v := range ints {
		out[i] = byte(v)
	}
	return out
}

func encodeUpdate(docID string, payload []byte) ([]byte, error) {
	inner := DocUpdatePayload{Type: "update", DocID: docID, Updates: bytesToInts(payload)}
	raw, err := json.Marshal(inner)
	if err != nil {
		return nil, err
	}
	return json.Marshal(Envelope{Channel: "doc", Payload: raw})
}

func encodeSnapshotRequest(docID string) ([]byte, error) {
	inner := DocSnapshotRequestPayload{Type: "snapshot-request", DocID: docID}
	raw, err := json.Marshal(inner)
	if err != nil {
		return nil, err
	}
	return json.Marshal(Envelope{Channel: "doc", Payload: raw})
}
