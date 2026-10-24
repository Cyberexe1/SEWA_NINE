package com.p2pchat.app;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UnsupportedEncodingException;
import java.util.UUID;

/**
 * A single unit of traffic exchanged between NINE devices.
 *
 * Packets are serialized to JSON and written to the socket with a 4-byte
 * big-endian length prefix, so many packets can share one continuous stream:
 *
 *     [ 4-byte length ][ JSON bytes ][ 4-byte length ][ JSON bytes ] ...
 *
 * This replaces the old raw-string protocol and is the foundation for the
 * multi-hop relay mesh (routing by srcId/dstId, hop-limiting via ttl, and
 * duplicate detection via msgId).
 */
public class Packet {

    // Packet types
    public static final String TYPE_HELLO = "HELLO";       // handshake: identity exchange
    public static final String TYPE_PRESENCE = "PRESENCE"; // periodic "I'm online" announcement
    public static final String TYPE_MSG = "MSG";           // a chat message
    public static final String TYPE_ACK = "ACK";           // delivery confirmation
    public static final String TYPE_LOCATION = "LOCATION"; // a GPS position share

    private static final int MAX_FRAME_BYTES = 1_000_000;  // guard against bad/huge frames

    public String type = "";
    public String msgId = "";      // unique id per original message (dedupe / ack)
    public String srcId = "";      // originating device id
    public String dstId = "";      // destination device id (empty = broadcast)
    public int ttl = 0;            // hop limit; decremented at each relay
    public int seq = 0;            // sequence counter (used by PRESENCE)
    public String name = "";       // display name (HELLO / PRESENCE / MSG sender)
    public String pubKey = "";     // sender's public key (shared via PRESENCE)
    public String payload = "";    // message body (encrypted for addressed messages)
    public double lat = 0;         // latitude (LOCATION packets)
    public double lon = 0;         // longitude (LOCATION packets)
    public long timestamp = System.currentTimeMillis();

    public Packet() {
    }

    public Packet(String type) {
        this.type = type;
    }

    public JSONObject toJson() throws JSONException {
        JSONObject o = new JSONObject();
        o.put("type", type);
        o.put("msgId", msgId);
        o.put("srcId", srcId);
        o.put("dstId", dstId);
        o.put("ttl", ttl);
        o.put("seq", seq);
        o.put("name", name);
        o.put("pubKey", pubKey);
        o.put("payload", payload);
        o.put("lat", lat);
        o.put("lon", lon);
        o.put("timestamp", timestamp);
        return o;
    }

    public static Packet fromJson(JSONObject o) {
        Packet p = new Packet();
        p.type = o.optString("type", "");
        p.msgId = o.optString("msgId", "");
        p.srcId = o.optString("srcId", "");
        p.dstId = o.optString("dstId", "");
        p.ttl = o.optInt("ttl", 0);
        p.seq = o.optInt("seq", 0);
        p.name = o.optString("name", "");
        p.pubKey = o.optString("pubKey", "");
        p.payload = o.optString("payload", "");
        p.lat = o.optDouble("lat", 0);
        p.lon = o.optDouble("lon", 0);
        p.timestamp = o.optLong("timestamp", System.currentTimeMillis());
        return p;
    }

    /** Serialize and write this packet as one length-prefixed frame. */
    public void writeTo(DataOutputStream out) throws IOException {
        byte[] data;
        try {
            data = toJson().toString().getBytes("UTF-8");
        } catch (JSONException | UnsupportedEncodingException e) {
            throw new IOException("Failed to serialize packet", e);
        }
        synchronized (out) {
            out.writeInt(data.length);
            out.write(data);
            out.flush();
        }
    }

    /**
     * Read one length-prefixed frame and parse it.
     * Returns null when the stream reaches end-of-file (peer closed).
     */
    public static Packet readFrom(DataInputStream in) throws IOException {
        int len;
        try {
            len = in.readInt();
        } catch (EOFException eof) {
            return null;
        }
        if (len <= 0 || len > MAX_FRAME_BYTES) {
            throw new IOException("Invalid frame length: " + len);
        }
        byte[] data = new byte[len];
        in.readFully(data);
        try {
            return fromJson(new JSONObject(new String(data, "UTF-8")));
        } catch (JSONException | UnsupportedEncodingException e) {
            throw new IOException("Malformed packet", e);
        }
    }

    public static String newMsgId() {
        return UUID.randomUUID().toString();
    }

    // Convenience factories

    public static Packet hello(String deviceId, String name) {
        Packet p = new Packet(TYPE_HELLO);
        p.srcId = deviceId;
        p.name = name;
        return p;
    }

    public static Packet message(String srcId, String dstId, String name, String text, int ttl) {
        Packet p = new Packet(TYPE_MSG);
        p.msgId = newMsgId();
        p.srcId = srcId;
        p.dstId = dstId;
        p.name = name;
        p.payload = text;
        p.ttl = ttl;
        return p;
    }
}
