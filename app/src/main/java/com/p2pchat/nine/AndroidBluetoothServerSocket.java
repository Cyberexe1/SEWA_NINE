package com.p2pchat.nine;

import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;

import java.io.IOException;

/**
 * NINE Platform Bridge — Android Bluetooth Server Socket Wrapper
 *
 * Wraps Android's BluetoothServerSocket for accepting inbound RFCOMM
 * connections. Each accepted socket is wrapped in an AndroidBluetoothSocket.
 *
 * Corresponds to IBluetoothServerSocket in the TypeScript BluetoothAcceptLoop.
 *
 * API Status: STABLE (Phase 10.1)
 */
public class AndroidBluetoothServerSocket {

    private final BluetoothServerSocket serverSocket;
    private volatile boolean closed = false;

    public AndroidBluetoothServerSocket(BluetoothServerSocket serverSocket) {
        this.serverSocket = serverSocket;
    }

    /**
     * Block until a remote device connects. Returns the accepted socket.
     * @return a connected AndroidBluetoothSocket
     * @throws IOException if the server socket is closed or an error occurs
     */
    public AndroidBluetoothSocket accept() throws IOException {
        BluetoothSocket raw = serverSocket.accept();
        AndroidBluetoothSocket wrapper = new AndroidBluetoothSocket(raw);
        wrapper.initStreams(); // accepted sockets are already connected
        return wrapper;
    }

    /** Close the server socket, causing any blocking accept() to throw. */
    public void close() {
        if (closed) return;
        closed = true;
        try {
            serverSocket.close();
        } catch (IOException ignored) {}
    }

    /** Whether the server socket has been closed. */
    public boolean isClosed() {
        return closed;
    }
}
