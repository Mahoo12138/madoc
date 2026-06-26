package socketio

import (
	"fmt"
	"strconv"
	"strings"
)

// Engine.IO packet types
const (
	EngineOpen    byte = '0'
	EngineClose   byte = '1'
	EnginePing    byte = '2'
	EnginePong    byte = '3'
	EngineMessage byte = '4'
	EngineUpgrade byte = '5'
	EngineNoop    byte = '6'
)

// Socket.IO packet types
const (
	SioConnect      byte = 0
	SioDisconnect   byte = 1
	SioEvent        byte = 2
	SioAck          byte = 3
	SioConnectError byte = 4
	SioBinaryEvent  byte = 5
	SioBinaryAck    byte = 6
)

type EnginePacket struct {
	Type byte
	Data string
}

func (p EnginePacket) Encode() string {
	return string(p.Type) + p.Data
}

func DecodeEnginePacket(raw string) EnginePacket {
	if len(raw) == 0 {
		return EnginePacket{}
	}
	return EnginePacket{Type: raw[0], Data: raw[1:]}
}

type SioPacket struct {
	Type      byte
	Namespace string
	ID        int
	Data      string
}

func (p SioPacket) Encode() string {
	var b strings.Builder
	b.WriteByte(byte(p.Type) + '0')
	if p.Namespace != "" && p.Namespace != "/" {
		b.WriteString(p.Namespace)
		b.WriteByte(',')
	}
	if p.ID >= 0 {
		b.WriteString(strconv.Itoa(p.ID))
	}
	if p.Data != "" {
		if p.Namespace != "" && p.Namespace != "/" {
			// data follows namespace
		}
		b.WriteString(p.Data)
	}
	return b.String()
}

func DecodeSioPacket(raw string) SioPacket {
	if len(raw) == 0 {
		return SioPacket{ID: -1}
	}
	p := SioPacket{ID: -1}
	p.Type = raw[0] - '0'
	rest := raw[1:]
	if len(rest) == 0 {
		return p
	}
	if rest[0] == '/' {
		idx := strings.IndexByte(rest, ',')
		if idx >= 0 {
			p.Namespace = rest[:idx]
			rest = rest[idx+1:]
		} else {
			p.Namespace = rest
			rest = ""
		}
	}
	if len(rest) > 0 {
		if rest[0] >= '0' && rest[0] <= '9' {
			for i := 0; i < len(rest); i++ {
				if rest[i] < '0' || rest[i] > '9' {
					p.ID, _ = strconv.Atoi(rest[:i])
					rest = rest[i:]
					break
				}
			}
			if p.ID < 0 {
				p.ID, _ = strconv.Atoi(rest)
				rest = ""
			}
		}
	}
	p.Data = rest
	return p
}

func FormatAck(id int, data string) string {
	return SioPacket{Type: SioAck, ID: id, Data: data}.Encode()
}

func FormatEvent(name string, args string) string {
	return SioPacket{Type: SioEvent, Data: fmt.Sprintf(`["%s",%s]`, name, args)}.Encode()
}

func FormatConnect(ns string) string {
	if ns == "" || ns == "/" {
		return "0"
	}
	return "0" + ns
}

func FormatConnectError(ns string, reason string) string {
	return fmt.Sprintf("4%s,{\"message\":%q}", ns, reason)
}
