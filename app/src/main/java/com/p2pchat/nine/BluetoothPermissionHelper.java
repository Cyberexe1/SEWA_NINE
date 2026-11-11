package com.p2pchat.nine;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

/**
 * NINE Platform Bridge — Bluetooth Permission Helper
 *
 * Handles the fragmented Android Bluetooth permission model across API levels:
 * - API 23–30: BLUETOOTH + BLUETOOTH_ADMIN + ACCESS_FINE_LOCATION
 * - API 31+:   BLUETOOTH_CONNECT + BLUETOOTH_SCAN + BLUETOOTH_ADVERTISE
 *
 * This class only CHECKS permissions — it does not REQUEST them (requesting
 * requires an Activity context with onRequestPermissionsResult). The Activity
 * layer should call the appropriate request methods before using the adapter.
 *
 * API Status: STABLE (Phase 10.1)
 */
public class BluetoothPermissionHelper {

    private final Context context;

    public BluetoothPermissionHelper(Context context) {
        this.context = context.getApplicationContext();
    }

    /** Check if BLUETOOTH_CONNECT (API 31+) or legacy BLUETOOTH is granted. */
    public boolean hasConnectPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return hasPermission(Manifest.permission.BLUETOOTH_CONNECT);
        }
        // Legacy: BLUETOOTH permission is normal (auto-granted at install)
        return hasPermission(Manifest.permission.BLUETOOTH);
    }

    /** Check if BLUETOOTH_SCAN (API 31+) or legacy location is granted. */
    public boolean hasScanPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return hasPermission(Manifest.permission.BLUETOOTH_SCAN);
        }
        // Legacy: discovery requires location permission
        return hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                || hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    /** Check if BLUETOOTH_ADVERTISE (API 31+) is granted. */
    public boolean hasAdvertisePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return hasPermission(Manifest.permission.BLUETOOTH_ADVERTISE);
        }
        // Legacy: no special permission for discoverability (handled via intent)
        return true;
    }

    /** Check if all required Bluetooth permissions are granted. */
    public boolean hasAllPermissions() {
        return hasConnectPermission() && hasScanPermission() && hasAdvertisePermission();
    }

    /**
     * Get the list of permissions that need to be requested for the current API level.
     * @return array of permission strings to request, or empty if all granted
     */
    public String[] getMissingPermissions() {
        java.util.List<String> missing = new java.util.ArrayList<>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (!hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) {
                missing.add(Manifest.permission.BLUETOOTH_CONNECT);
            }
            if (!hasPermission(Manifest.permission.BLUETOOTH_SCAN)) {
                missing.add(Manifest.permission.BLUETOOTH_SCAN);
            }
            if (!hasPermission(Manifest.permission.BLUETOOTH_ADVERTISE)) {
                missing.add(Manifest.permission.BLUETOOTH_ADVERTISE);
            }
        } else {
            if (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) {
                missing.add(Manifest.permission.ACCESS_FINE_LOCATION);
            }
        }

        return missing.toArray(new String[0]);
    }

    /**
     * Check if the device's API level requires the new (API 31+) permission model.
     * @return true if API 31+ (Android 12+)
     */
    public boolean usesNewPermissionModel() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
    }

    private boolean hasPermission(String permission) {
        return ContextCompat.checkSelfPermission(context, permission)
                == PackageManager.PERMISSION_GRANTED;
    }
}
