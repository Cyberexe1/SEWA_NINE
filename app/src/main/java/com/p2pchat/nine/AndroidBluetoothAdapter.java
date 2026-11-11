package com.p2pchat.nine;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.Context;

import java.util.Set;
import java.util.UUID;

/**
 * NINE Platform Bridge — Android Bluetooth Adapter Wrapper
 *
 * Satisfies the IBluetoothAdapter contract defined in the TypeScript
 * BluetoothTransport by wrapping Android's BluetoothAdapter. Hides all
 * framework-specific details (intents, permissions, system services)
 * behind a clean interface that the transport layer consumes.
 *
 * API Status: STABLE (Phase 10.1)
 */
public class AndroidBluetoothAdapter {

    private static final String TAG = "NineBluetoothAdapter";
    private static final UUID NINE_SERVICE_UUID =
            UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String NINE_SERVICE_NAME = "NINE-Mesh";

    private final BluetoothAdapter adapter;
    private final Context context;
    private final BluetoothPermissionHelper permissions;

    /**
     * @param context Application or Activity context (for permission checks)
     */
    public AndroidBluetoothAdapter(Context context) {
        this.context = context.getApplicationContext();
        this.adapter = BluetoothAdapter.getDefaultAdapter();
        this.permissions = new BluetoothPermissionHelper(this.context);
    }

    /** Check if Bluetooth hardware is available and enabled. */
    public boolean isEnabled() {
        return adapter != null && adapter.isEnabled();
    }

    /** Check if the adapter hardware exists on this device. */
    public boolean isAvailable() {
        return adapter != null;
    }

    /**
     * Start Bluetooth Classic device discovery.
     * @return true if discovery started, false if adapter unavailable or permission missing
     */
    public boolean startDiscovery() {
        if (!isEnabled()) return false;
        if (!permissions.hasScanPermission()) return false;
        try {
            return adapter.startDiscovery();
        } catch (SecurityException e) {
            return false;
        }
    }

    /** Cancel an ongoing discovery scan. */
    public void cancelDiscovery() {
        if (adapter == null) return;
        try {
            if (adapter.isDiscovering()) {
                adapter.cancelDiscovery();
            }
        } catch (SecurityException e) {
            // Permission revoked — silently ignore
        }
    }

    /** Check if a discovery scan is currently active. */
    public boolean isDiscovering() {
        if (adapter == null) return false;
        try {
            return adapter.isDiscovering();
        } catch (SecurityException e) {
            return false;
        }
    }

    /**
     * Create an RFCOMM server socket for accepting inbound connections.
     * @return wrapper around BluetoothServerSocket
     * @throws SecurityException if BLUETOOTH_CONNECT permission is missing
     * @throws java.io.IOException if socket creation fails
     */
    public AndroidBluetoothServerSocket createServerSocket() throws Exception {
        if (!permissions.hasConnectPermission()) {
            throw new SecurityException("BLUETOOTH_CONNECT permission required");
        }
        return new AndroidBluetoothServerSocket(
                adapter.listenUsingRfcommWithServiceRecord(NINE_SERVICE_NAME, NINE_SERVICE_UUID)
        );
    }

    /**
     * Create an RFCOMM client socket to connect to a discovered device.
     * @param device The remote BluetoothDevice to connect to
     * @return wrapper around BluetoothSocket
     * @throws SecurityException if BLUETOOTH_CONNECT permission is missing
     * @throws java.io.IOException if socket creation fails
     */
    public AndroidBluetoothSocket createSocket(BluetoothDevice device) throws Exception {
        if (!permissions.hasConnectPermission()) {
            throw new SecurityException("BLUETOOTH_CONNECT permission required");
        }
        return new AndroidBluetoothSocket(
                device.createRfcommSocketToServiceRecord(NINE_SERVICE_UUID)
        );
    }

    /**
     * Get the set of currently bonded (paired) devices.
     * @return set of paired devices, or empty set if unavailable
     */
    public Set<BluetoothDevice> getBondedDevices() {
        if (adapter == null) return java.util.Collections.emptySet();
        try {
            Set<BluetoothDevice> devices = adapter.getBondedDevices();
            return devices != null ? devices : java.util.Collections.emptySet();
        } catch (SecurityException e) {
            return java.util.Collections.emptySet();
        }
    }

    /**
     * Resolve a Bluetooth MAC address string to a BluetoothDevice object.
     * @param address MAC address (e.g., "AA:BB:CC:DD:EE:FF")
     * @return BluetoothDevice, or null if adapter unavailable
     */
    public BluetoothDevice getRemoteDevice(String address) {
        if (adapter == null) return null;
        return adapter.getRemoteDevice(address);
    }

    /** Get the permission helper for external permission checks/requests. */
    public BluetoothPermissionHelper getPermissions() {
        return permissions;
    }

    /** Get the underlying Android BluetoothAdapter (for advanced use only). */
    public BluetoothAdapter getRawAdapter() {
        return adapter;
    }

    /** Get the NINE service UUID used for RFCOMM connections. */
    public static UUID getServiceUuid() {
        return NINE_SERVICE_UUID;
    }
}
