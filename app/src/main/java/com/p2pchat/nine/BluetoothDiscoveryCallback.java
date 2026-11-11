package com.p2pchat.nine;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.util.Log;

/**
 * NINE Platform Bridge — Bluetooth Discovery BroadcastReceiver
 *
 * Translates Android's discovery intents (ACTION_FOUND, ACTION_DISCOVERY_FINISHED)
 * into simple callbacks that the transport layer can consume without knowing
 * about Android's BroadcastReceiver mechanism.
 *
 * Usage:
 *   1. Create with a DiscoveryListener
 *   2. Call register(context) to start listening
 *   3. Adapter fires ACTION_FOUND → onDeviceFound callback
 *   4. Adapter fires ACTION_DISCOVERY_FINISHED → onDiscoveryFinished callback
 *   5. Call unregister(context) when done
 *
 * API Status: STABLE (Phase 10.1)
 */
public class BluetoothDiscoveryCallback extends BroadcastReceiver {

    private static final String TAG = "NineDiscovery";

    /** Callback interface for discovery events. */
    public interface DiscoveryListener {
        /** Called when a new device is found during scanning. */
        void onDeviceFound(BluetoothDevice device, String name, int rssi);

        /** Called when the discovery scan completes (timeout or explicit cancel). */
        void onDiscoveryFinished();

        /** Called if discovery fails to start or an error occurs. */
        void onDiscoveryFailed(String reason);
    }

    private final DiscoveryListener listener;
    private boolean registered = false;

    public BluetoothDiscoveryCallback(DiscoveryListener listener) {
        this.listener = listener;
    }

    /**
     * Register this receiver with the system to start receiving discovery events.
     * @param context Application or Activity context
     */
    public void register(Context context) {
        if (registered) return;
        IntentFilter filter = new IntentFilter();
        filter.addAction(BluetoothDevice.ACTION_FOUND);
        filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        filter.addAction(BluetoothAdapter.ACTION_STATE_CHANGED);
        context.registerReceiver(this, filter);
        registered = true;
    }

    /**
     * Unregister this receiver from the system.
     * @param context Same context used for register()
     */
    public void unregister(Context context) {
        if (!registered) return;
        try {
            context.unregisterReceiver(this);
        } catch (IllegalArgumentException e) {
            // Already unregistered — safe to ignore
            Log.w(TAG, "Receiver already unregistered");
        }
        registered = false;
    }

    /** Whether this receiver is currently registered. */
    public boolean isRegistered() {
        return registered;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        switch (intent.getAction()) {
            case BluetoothDevice.ACTION_FOUND:
                handleDeviceFound(intent);
                break;

            case BluetoothAdapter.ACTION_DISCOVERY_FINISHED:
                listener.onDiscoveryFinished();
                break;

            case BluetoothAdapter.ACTION_STATE_CHANGED:
                int state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR);
                if (state == BluetoothAdapter.STATE_OFF || state == BluetoothAdapter.STATE_TURNING_OFF) {
                    listener.onDiscoveryFailed("ADAPTER_DISABLED");
                }
                break;
        }
    }

    private void handleDeviceFound(Intent intent) {
        BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
        if (device == null) return;

        String name;
        try {
            name = device.getName();
        } catch (SecurityException e) {
            name = null;
        }
        if (name == null) name = "Unknown";

        short rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE);

        listener.onDeviceFound(device, name, rssi);
    }
}
