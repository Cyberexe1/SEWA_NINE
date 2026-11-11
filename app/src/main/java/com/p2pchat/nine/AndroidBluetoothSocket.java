package com.p2pchat.nine;

import android.bluetooth.BluetoothSocket;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * NINE Platform Bridge — Android Bluetooth Socket Wrapper
 *
 * Wraps a single Android BluetoothSocket (RFCOMM) and exposes the
 * operations required by the transport layer: connect, close, read, write.
 *
 * Corresponds to IBluetoothSocket in the TypeScript BluetoothLink.
 *
 * API Status: STABLE (Phase 10.1)
 */
public class AndroidBluetoothSocket {

    private final BluetoothSocket socket;
    private DataInputStream dataIn;
    private DataOutputStream dataOut;
    private volatile boolean closed = false;

    public AndroidBluetoothSocket(BluetoothSocket socket) {
        this.socket = socket;
    }

    /**
     * Establish the RFCOMM connection (blocking).
     * @throws IOException if connection fails
     * @throws SecurityException if BLUETOOTH_CONNECT permission is missing
     */
    public void connect() throws IOException {
        socket.connect();
        initStreams();
    }

    /**
     * Initialize I/O streams. Called after connect() or after accept()
     * (for inbound sockets that are already connected).
     */
    public void initStreams() throws IOException {
        InputStream in = socket.getInputStream();
        OutputStream out = socket.getOutputStream();
        this.dataIn = new DataInputStream(in);
        this.dataOut = new DataOutputStream(out);
    }

    /** Close the socket and release resources. */
    public void close() {
        if (closed) return;
        closed = true;
        try { socket.close(); } catch (IOException ignored) {}
    }

    /** Whether the socket is currently connected. */
    public boolean isConnected() {
        return !closed && socket.isConnected();
    }

    /**
     * Write raw bytes to the socket output stream.
     * Thread-safe: synchronized on the output stream.
     * @param data bytes to write
     * @throws IOException on write failure
     */
    public void write(byte[] data) throws IOException {
        if (closed || dataOut == null) throw new IOException("Socket closed");
        synchronized (dataOut) {
            dataOut.write(data);
            dataOut.flush();
        }
    }

    /**
     * Read exactly `size` bytes from the socket input stream (blocking).
     * @param size number of bytes to read
     * @return byte array of exactly `size` bytes
     * @throws IOException on EOF or read error
     */
    public byte[] read(int size) throws IOException {
        if (closed || dataIn == null) throw new IOException("Socket closed");
        byte[] buffer = new byte[size];
        dataIn.readFully(buffer);
        return buffer;
    }

    /**
     * Get the remote device's Bluetooth MAC address.
     * @return address string (e.g., "AA:BB:CC:DD:EE:FF")
     */
    public String getRemoteAddress() {
        try {
            return socket.getRemoteDevice().getAddress();
        } catch (SecurityException e) {
            return "00:00:00:00:00:00";
        }
    }

    /** Get the underlying Android BluetoothSocket (for advanced use only). */
    public BluetoothSocket getRawSocket() {
        return socket;
    }
}
