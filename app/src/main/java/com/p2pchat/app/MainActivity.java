package com.p2pchat.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.widget.Button;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private static final int REQUEST_BLUETOOTH_PERMISSIONS = 1;
    
    private Button btnBluetooth;
    private BluetoothAdapter bluetoothAdapter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        initViews();
        checkPermissions();
        setupClickListeners();
    }
    
    private void initViews() {
        btnBluetooth = findViewById(R.id.btn_bluetooth);
        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
    }
    
    private void checkPermissions() {
        if (!hasBluetoothPermissions()) {
            requestBluetoothPermissions();
        }
    }
    
    private boolean hasBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED &&
                   ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED;
        } else {
            return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        }
    }
    
    private void requestBluetoothPermissions() {
        List<String> permissionsToRequest = new ArrayList<>();
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissionsToRequest.add(Manifest.permission.BLUETOOTH_CONNECT);
            permissionsToRequest.add(Manifest.permission.BLUETOOTH_SCAN);
            permissionsToRequest.add(Manifest.permission.BLUETOOTH_ADVERTISE);
        } else {
            permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION);
            permissionsToRequest.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        
        ActivityCompat.requestPermissions(this, 
            permissionsToRequest.toArray(new String[0]), 
            REQUEST_BLUETOOTH_PERMISSIONS);
    }
    
    private void setupClickListeners() {
        btnBluetooth.setOnClickListener(v -> {
            if (bluetoothAdapter == null) {
                Toast.makeText(this, "Bluetooth not supported on this device", Toast.LENGTH_SHORT).show();
                return;
            }
            
            if (hasBluetoothPermissions()) {
                startActivity(new Intent(this, BluetoothChatActivity.class));
            } else {
                showPermissionExplanation("Bluetooth", 
                    "Location permission is required for Bluetooth device discovery on Android 10-11. " +
                    "On Android 12+, Bluetooth permissions are required.",
                    this::requestBluetoothPermissions);
            }
        });
    }
    
    private void showPermissionExplanation(String feature, String message, Runnable onAccept) {
        new AlertDialog.Builder(this)
            .setTitle(feature + " Permissions Required")
            .setMessage(message)
            .setPositiveButton("Grant Permissions", (dialog, which) -> onAccept.run())
            .setNegativeButton("Cancel", null)
            .show();
    }
    
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        
        boolean allGranted = true;
        for (int result : grantResults) {
            if (result != PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
                break;
            }
        }
        
        if (requestCode == REQUEST_BLUETOOTH_PERMISSIONS) {
            if (allGranted) {
                Toast.makeText(this, "Bluetooth permissions granted! You can now use Bluetooth Chat.", Toast.LENGTH_LONG).show();
            } else {
                Toast.makeText(this, "Bluetooth permissions denied. The app needs these permissions to discover devices.", Toast.LENGTH_LONG).show();
            }
        }
    }
}
