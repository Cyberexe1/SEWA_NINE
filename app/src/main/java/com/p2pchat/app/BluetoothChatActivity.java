package com.p2pchat.app;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.UUID;

public class BluetoothChatActivity extends AppCompatActivity {
    private static final String TAG = "BluetoothChat";
    private static final UUID MY_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String APP_NAME = "P2PChat";
    private static final String PREFS_NAME = "P2PChatPrefs";
    private static final String KEY_USERNAME = "username";
    private static final String MESSAGE_SEPARATOR = "::MSG::";
    private static final int REQUEST_ENABLE_BT = 1;
    private static final int REQUEST_BLUETOOTH_PERMISSIONS = 2;
    private static final int REQUEST_DISCOVERABLE = 3;
    
    private BluetoothAdapter bluetoothAdapter;
    private ArrayAdapter<String> deviceListAdapter;
    private ArrayAdapter<String> messageAdapter;
    private ArrayList<BluetoothDevice> discoveredDevices;
    
    private ListView deviceList, messageList;
    private EditText messageInput;
    private Button btnStartServer, btnDiscoverDevices, btnSendMessage, btnMakeDiscoverable;
    private TextView statusText, usernameDisplay, connectionIndicator;
    
    private BluetoothServerSocket serverSocket;
    private BluetoothSocket clientSocket;
    private ConnectedThread connectedThread;
    private AcceptThread acceptThread;
    private Handler mainHandler;
    
    private boolean isServer = false;
    private boolean isConnected = false;
    private String username = "User";
    private String peerUsername = "Peer";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_bluetooth_chat);
        
        initViews();
        loadUsername();
        initBluetooth();
        setupClickListeners();
        
        mainHandler = new Handler(Looper.getMainLooper());
        
        // Show username dialog if not set
        if (username.equals("User")) {
            showUsernameDialog();
        }
    }
    
    private void initViews() {
        deviceList = findViewById(R.id.device_list);
        messageList = findViewById(R.id.message_list);
        messageInput = findViewById(R.id.message_input);
        btnStartServer = findViewById(R.id.btn_start_server);
        btnDiscoverDevices = findViewById(R.id.btn_discover_devices);
        btnSendMessage = findViewById(R.id.btn_send_message);
        btnMakeDiscoverable = findViewById(R.id.btn_make_discoverable);
        statusText = findViewById(R.id.status_text);
        usernameDisplay = findViewById(R.id.username_display);
        connectionIndicator = findViewById(R.id.connection_indicator);
        updateConnectionIndicator(false);
        
        discoveredDevices = new ArrayList<>();
        deviceListAdapter = new ArrayAdapter<>(this, R.layout.list_item_device);
        messageAdapter = new ArrayAdapter<>(this, R.layout.list_item_message);
        
        deviceList.setAdapter(deviceListAdapter);
        messageList.setAdapter(messageAdapter);
    }
    
    private void loadUsername() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        username = prefs.getString(KEY_USERNAME, "User");
        updateUsernameDisplay();
    }
    
    private void saveUsername(String name) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit().putString(KEY_USERNAME, name).apply();
        username = name;
        updateUsernameDisplay();
    }
    
    private void updateUsernameDisplay() {
        if (usernameDisplay != null) {
            usernameDisplay.setText("You: " + username);
        }
    }
    
    // Green dot when connected to a peer, red dot otherwise
    private void updateConnectionIndicator(boolean connected) {
        if (connectionIndicator != null) {
            connectionIndicator.setTextColor(connected ? 0xFF4CAF50 : 0xFFF44336);
        }
    }
    
    private void showUsernameDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        View dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_username, null);
        EditText usernameInput = dialogView.findViewById(R.id.username_input);
        
        builder.setView(dialogView)
            .setTitle("Set Your Username")
            .setPositiveButton("Save", (dialog, which) -> {
                String name = usernameInput.getText().toString().trim();
                if (!name.isEmpty()) {
                    saveUsername(name);
                    Toast.makeText(this, "Username set to: " + name, Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(this, "Using default username: User", Toast.LENGTH_SHORT).show();
                }
            })
            .setNegativeButton("Cancel", null)
            .setCancelable(false)
            .show();
    }
    
    private void initBluetooth() {
        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        
        if (bluetoothAdapter == null) {
            Toast.makeText(this, "Bluetooth not supported", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }
        
        // Check and request permissions
        if (!hasBluetoothPermissions()) {
            requestBluetoothPermissions();
            return;
        }
        
        // Enable Bluetooth if not enabled
        try {
            if (!bluetoothAdapter.isEnabled()) {
                Intent enableBtIntent = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
                startActivityForResult(enableBtIntent, REQUEST_ENABLE_BT);
            }
        } catch (SecurityException e) {
            Log.e(TAG, "Permission error enabling Bluetooth", e);
            Toast.makeText(this, "Bluetooth permission required", Toast.LENGTH_SHORT).show();
        }
        
        // Register for broadcasts when a device is discovered
        IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_FOUND);
        filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        registerReceiver(receiver, filter);
    }
    
    private boolean hasBluetoothPermissions() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            return checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) == android.content.pm.PackageManager.PERMISSION_GRANTED &&
                   checkSelfPermission(android.Manifest.permission.BLUETOOTH_SCAN) == android.content.pm.PackageManager.PERMISSION_GRANTED &&
                   checkSelfPermission(android.Manifest.permission.BLUETOOTH_ADVERTISE) == android.content.pm.PackageManager.PERMISSION_GRANTED;
        } else {
            return checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
        }
    }
    
    private void requestBluetoothPermissions() {
        java.util.List<String> permissionsToRequest = new java.util.ArrayList<>();
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            if (checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(android.Manifest.permission.BLUETOOTH_CONNECT);
            }
            if (checkSelfPermission(android.Manifest.permission.BLUETOOTH_SCAN) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(android.Manifest.permission.BLUETOOTH_SCAN);
            }
            if (checkSelfPermission(android.Manifest.permission.BLUETOOTH_ADVERTISE) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(android.Manifest.permission.BLUETOOTH_ADVERTISE);
            }
        } else {
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(android.Manifest.permission.ACCESS_FINE_LOCATION);
            }
        }
        
        if (!permissionsToRequest.isEmpty()) {
            requestPermissions(permissionsToRequest.toArray(new String[0]), REQUEST_BLUETOOTH_PERMISSIONS);
        }
    }
    
    private void setupClickListeners() {
        btnStartServer.setOnClickListener(v -> startServer());
        btnDiscoverDevices.setOnClickListener(v -> discoverDevices());
        btnSendMessage.setOnClickListener(v -> sendMessage());
        btnMakeDiscoverable.setOnClickListener(v -> makeDiscoverable());
        
        // Long press on username to change it
        if (usernameDisplay != null) {
            usernameDisplay.setOnLongClickListener(v -> {
                showUsernameDialog();
                return true;
            });
        }
        
        // Long press on status to check permissions (debug feature)
        if (statusText != null) {
            statusText.setOnLongClickListener(v -> {
                checkAndShowPermissionStatus();
                return true;
            });
        }
        
        deviceList.setOnItemClickListener((parent, view, position, id) -> {
            if (position < discoveredDevices.size()) {
                BluetoothDevice device = discoveredDevices.get(position);
                connectToDevice(device);
            }
        });
    }
    
    private void checkAndShowPermissionStatus() {
        StringBuilder status = new StringBuilder("Permission Status:\n\n");
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            // Android 12+
            status.append("BLUETOOTH_SCAN: ")
                  .append(checkSelfPermission(android.Manifest.permission.BLUETOOTH_SCAN) == android.content.pm.PackageManager.PERMISSION_GRANTED ? "✓ Granted" : "✗ Denied")
                  .append("\n");
            status.append("BLUETOOTH_CONNECT: ")
                  .append(checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) == android.content.pm.PackageManager.PERMISSION_GRANTED ? "✓ Granted" : "✗ Denied")
                  .append("\n");
            status.append("BLUETOOTH_ADVERTISE: ")
                  .append(checkSelfPermission(android.Manifest.permission.BLUETOOTH_ADVERTISE) == android.content.pm.PackageManager.PERMISSION_GRANTED ? "✓ Granted" : "✗ Denied")
                  .append("\n");
        } else {
            // Android 10-11
            status.append("ACCESS_FINE_LOCATION: ")
                  .append(checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED ? "✓ Granted" : "✗ Denied")
                  .append("\n");
            
            // Check location services
            android.location.LocationManager locationManager = (android.location.LocationManager) getSystemService(Context.LOCATION_SERVICE);
            boolean locationEnabled = locationManager != null && 
                (locationManager.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) || 
                 locationManager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER));
            status.append("Location Services: ")
                  .append(locationEnabled ? "✓ Enabled" : "✗ Disabled")
                  .append("\n");
        }
        
        try {
            status.append("\nBluetooth Enabled: ")
                  .append(bluetoothAdapter.isEnabled() ? "✓ Yes" : "✗ No")
                  .append("\n");
        } catch (SecurityException e) {
            status.append("\nBluetooth Status: ✗ Permission Error\n");
        }
        
        status.append("\nAndroid Version: ").append(android.os.Build.VERSION.SDK_INT);
        
        new AlertDialog.Builder(this)
            .setTitle("Debug Info")
            .setMessage(status.toString())
            .setPositiveButton("Request Permissions", (dialog, which) -> requestBluetoothPermissions())
            .setNegativeButton("Close", null)
            .show();
    }
    
    private void makeDiscoverable() {
        if (!hasBluetoothPermissions()) {
            requestBluetoothPermissions();
            return;
        }
        
        try {
            Intent discoverableIntent = new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE);
            discoverableIntent.putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, 300);
            startActivityForResult(discoverableIntent, REQUEST_DISCOVERABLE);
            Toast.makeText(this, "Making device discoverable for 5 minutes", Toast.LENGTH_LONG).show();
        } catch (SecurityException e) {
            Log.e(TAG, "Permission error making discoverable", e);
            Toast.makeText(this, "Permission required to make device discoverable", Toast.LENGTH_SHORT).show();
        }
    }
    
    private void startServer() {
        if (!hasBluetoothPermissions()) {
            requestBluetoothPermissions();
            return;
        }
        
        if (isConnected) {
            Toast.makeText(this, "Already connected to a device", Toast.LENGTH_SHORT).show();
            return;
        }
        
        // Automatically make device discoverable when starting server
        makeDiscoverable();
        
        // Start accept thread for continuous listening
        acceptThread = new AcceptThread();
        acceptThread.start();
        
        isServer = true;
        statusText.setText("Server started. Waiting for connections...");
        btnStartServer.setEnabled(false);
        Toast.makeText(this, "Server ready! Other devices can now find and connect to you.", Toast.LENGTH_LONG).show();
    }
    
    private void discoverDevices() {
        Log.d(TAG, "discoverDevices() called");
        
        // Check if Bluetooth adapter exists
        if (bluetoothAdapter == null) {
            Toast.makeText(this, "Bluetooth not supported on this device", Toast.LENGTH_SHORT).show();
            return;
        }
        
        // Check if Bluetooth is enabled
        try {
            if (!bluetoothAdapter.isEnabled()) {
                Toast.makeText(this, "Please enable Bluetooth first", Toast.LENGTH_LONG).show();
                Intent enableBtIntent = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
                startActivityForResult(enableBtIntent, REQUEST_ENABLE_BT);
                return;
            }
        } catch (SecurityException e) {
            Log.e(TAG, "Permission error checking Bluetooth state", e);
            Toast.makeText(this, "Bluetooth permission required", Toast.LENGTH_SHORT).show();
            requestBluetoothPermissions();
            return;
        }
        
        // Check runtime permissions
        if (!hasBluetoothPermissions()) {
            Log.w(TAG, "Bluetooth permissions not granted");
            Toast.makeText(this, "Granting Bluetooth permissions...", Toast.LENGTH_SHORT).show();
            requestBluetoothPermissions();
            return;
        }
        
        // Check location services for Android 10-11
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S) {
            android.location.LocationManager locationManager = (android.location.LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (locationManager != null && !locationManager.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) 
                && !locationManager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)) {
                Toast.makeText(this, "Please enable Location Services for Bluetooth discovery", Toast.LENGTH_LONG).show();
                Intent intent = new Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                startActivity(intent);
                return;
            }
        }
        
        discoveredDevices.clear();
        deviceListAdapter.clear();
        
        // Start discovery for available devices
        try {
            // Cancel any ongoing discovery first
            if (bluetoothAdapter.isDiscovering()) {
                Log.d(TAG, "Cancelling ongoing discovery");
                boolean cancelled = bluetoothAdapter.cancelDiscovery();
                Log.d(TAG, "Discovery cancelled: " + cancelled);
                
                // Wait a bit for cancellation to complete
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    startDiscoveryProcess();
                }, 500);
            } else {
                startDiscoveryProcess();
            }
        } catch (SecurityException e) {
            Log.e(TAG, "Permission error during discovery", e);
            statusText.setText("Permission denied");
            Toast.makeText(this, "Bluetooth scan permission required. Please grant permissions.", Toast.LENGTH_LONG).show();
            requestBluetoothPermissions();
        }
    }
    
    private void startDiscoveryProcess() {
        try {
            Log.d(TAG, "Attempting to start Bluetooth discovery");
            
            // Try to start discovery
            boolean started = bluetoothAdapter.startDiscovery();
            Log.d(TAG, "Discovery started: " + started);
            
            if (started) {
                statusText.setText("Discovering devices...");
                Toast.makeText(this, "Scanning for discoverable devices nearby. Make sure other device clicked 'Start Server' or 'Make Discoverable'.", Toast.LENGTH_LONG).show();
            } else {
                // Discovery failed - try to diagnose why
                statusText.setText("Failed to start discovery");
                Log.e(TAG, "startDiscovery() returned false");
                
                // Show diagnostic dialog
                showDiscoveryFailedDialog();
            }
        } catch (SecurityException e) {
            Log.e(TAG, "SecurityException during startDiscovery", e);
            statusText.setText("Permission error");
            Toast.makeText(this, "Permission error. Please check app permissions in Settings.", Toast.LENGTH_LONG).show();
        }
    }
    
    private void showDiscoveryFailedDialog() {
        StringBuilder message = new StringBuilder();
        message.append("Discovery failed to start.\n\n");
        message.append("Possible causes:\n");
        message.append("• Bluetooth adapter is busy\n");
        message.append("• Another app is using Bluetooth\n");
        message.append("• System Bluetooth service issue\n\n");
        message.append("Try:\n");
        message.append("1. Turn Bluetooth OFF and ON\n");
        message.append("2. Restart the app\n");
        message.append("3. Restart your device\n");
        
        new AlertDialog.Builder(this)
            .setTitle("Discovery Failed")
            .setMessage(message.toString())
            .setPositiveButton("Retry", (dialog, which) -> {
                // Try again after a delay
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    discoverDevices();
                }, 1000);
            })
            .setNeutralButton("Check Permissions", (dialog, which) -> {
                checkAndShowPermissionStatus();
            })
            .setNegativeButton("Cancel", null)
            .show();
    }
    
    private void connectToDevice(BluetoothDevice device) {
        if (isConnected) {
            Toast.makeText(this, "Already connected to a device. Disconnect first.", Toast.LENGTH_SHORT).show();
            return;
        }
        
        new Thread(() -> {
            try {
                clientSocket = device.createRfcommSocketToServiceRecord(MY_UUID);
                
                // Cancel discovery to improve connection speed
                try {
                    if (bluetoothAdapter.isDiscovering()) {
                        bluetoothAdapter.cancelDiscovery();
                    }
                } catch (SecurityException e) {
                    Log.e(TAG, "Permission error cancelling discovery", e);
                }
                
                mainHandler.post(() -> statusText.setText("Connecting to " + device.getName() + "..."));
                
                clientSocket.connect();
                
                mainHandler.post(() -> {
                    String deviceName = "Unknown";
                    try {
                        deviceName = device.getName() != null ? device.getName() : "Unknown Device";
                    } catch (SecurityException e) {
                        Log.e(TAG, "Permission error getting device name", e);
                    }
                    statusText.setText("Connected to " + deviceName);
                    isConnected = true;
                    startConnectedThread(clientSocket);
                    // Send username to peer
                    sendUsernameHandshake();
                    Toast.makeText(BluetoothChatActivity.this, "Connected successfully!", Toast.LENGTH_SHORT).show();
                });
                
            } catch (IOException e) {
                Log.e(TAG, "Connection failed", e);
                mainHandler.post(() -> {
                    statusText.setText("Connection failed: " + e.getMessage());
                    Toast.makeText(BluetoothChatActivity.this, "Connection failed. Make sure the other device has started the server.", Toast.LENGTH_LONG).show();
                });
            } catch (SecurityException e) {
                Log.e(TAG, "Permission error during connection", e);
                mainHandler.post(() -> {
                    statusText.setText("Permission error");
                    Toast.makeText(BluetoothChatActivity.this, "Bluetooth permission required", Toast.LENGTH_SHORT).show();
                });
            }
        }).start();
    }
    
    private void startConnectedThread(BluetoothSocket socket) {
        isConnected = true;
        mainHandler.post(() -> updateConnectionIndicator(true));
        connectedThread = new ConnectedThread(socket);
        connectedThread.start();
    }
    
    private void sendUsernameHandshake() {
        if (connectedThread != null) {
            String handshake = "USERNAME:" + username;
            connectedThread.write(handshake.getBytes());
        }
    }
    
    private void sendMessage() {
        String message = messageInput.getText().toString().trim();
        if (!message.isEmpty() && connectedThread != null) {
            // Format: username::MSG::message
            String formattedMessage = username + MESSAGE_SEPARATOR + message;
            connectedThread.write(formattedMessage.getBytes());
            messageAdapter.add(username + ": " + message);
            messageInput.setText("");
            
            // Show success message
            Toast.makeText(this, "Message sent successfully", Toast.LENGTH_SHORT).show();
        } else if (message.isEmpty()) {
            Toast.makeText(this, "Please enter a message", Toast.LENGTH_SHORT).show();
        } else {
            Toast.makeText(this, "Not connected to any device", Toast.LENGTH_SHORT).show();
        }
    }
    
    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (device != null) {
                    try {
                        // Avoid duplicates
                        if (!discoveredDevices.contains(device)) {
                            discoveredDevices.add(device);
                            String deviceName = device.getName() != null ? device.getName() : "Unknown Device";
                            deviceListAdapter.add(deviceName + "\n" + device.getAddress());
                            Toast.makeText(BluetoothChatActivity.this, "Found device: " + deviceName, Toast.LENGTH_SHORT).show();
                        }
                    } catch (SecurityException e) {
                        Log.e(TAG, "Permission error accessing device info", e);
                    }
                }
            } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
                statusText.setText("Discovery finished. Found " + discoveredDevices.size() + " devices");
                if (discoveredDevices.size() == 0) {
                    Toast.makeText(BluetoothChatActivity.this, "No devices found. Make sure other device is discoverable.", Toast.LENGTH_LONG).show();
                }
            }
        }
    };
    
    private class ConnectedThread extends Thread {
        private final BluetoothSocket socket;
        private final InputStream inputStream;
        private final OutputStream outputStream;
        
        public ConnectedThread(BluetoothSocket socket) {
            this.socket = socket;
            InputStream tmpIn = null;
            OutputStream tmpOut = null;
            
            try {
                tmpIn = socket.getInputStream();
                tmpOut = socket.getOutputStream();
            } catch (IOException e) {
                Log.e(TAG, "Error creating streams", e);
            }
            
            inputStream = tmpIn;
            outputStream = tmpOut;
        }
        
        public void run() {
            byte[] buffer = new byte[1024];
            int bytes;
            
            while (true) {
                try {
                    bytes = inputStream.read(buffer);
                    String receivedMessage = new String(buffer, 0, bytes);
                    
                    // Handle username handshake
                    if (receivedMessage.startsWith("USERNAME:")) {
                        peerUsername = receivedMessage.substring(9);
                        mainHandler.post(() -> {
                            statusText.setText("Connected to: " + peerUsername);
                            Toast.makeText(BluetoothChatActivity.this, peerUsername + " joined the chat", Toast.LENGTH_SHORT).show();
                        });
                    } 
                    // Handle regular message with username
                    else if (receivedMessage.contains(MESSAGE_SEPARATOR)) {
                        String[] parts = receivedMessage.split(MESSAGE_SEPARATOR, 2);
                        if (parts.length == 2) {
                            String senderName = parts[0];
                            String messageText = parts[1];
                            mainHandler.post(() -> messageAdapter.add(senderName + ": " + messageText));
                        }
                    }
                    // Handle legacy message without username
                    else {
                        mainHandler.post(() -> messageAdapter.add(peerUsername + ": " + receivedMessage));
                    }
                    
                } catch (IOException e) {
                    Log.e(TAG, "Connection lost", e);
                    mainHandler.post(() -> {
                        statusText.setText("Connection lost");
                        isConnected = false;
                        updateConnectionIndicator(false);
                        btnStartServer.setEnabled(true);
                        Toast.makeText(BluetoothChatActivity.this, peerUsername + " disconnected", Toast.LENGTH_SHORT).show();
                        
                        // Restart server if we were in server mode
                        if (isServer && acceptThread != null && !acceptThread.isInterrupted()) {
                            statusText.setText("Server ready. Waiting for new connections...");
                        }
                    });
                    break;
                }
            }
        }
        
        public void write(byte[] bytes) {
            try {
                outputStream.write(bytes);
            } catch (IOException e) {
                Log.e(TAG, "Error writing message", e);
                mainHandler.post(() -> Toast.makeText(BluetoothChatActivity.this, "Failed to send message", Toast.LENGTH_SHORT).show());
            }
        }
        
        public void cancel() {
            try {
                socket.close();
            } catch (IOException e) {
                Log.e(TAG, "Error closing socket", e);
            }
        }
    }
    
    // New AcceptThread for continuous server listening
    private class AcceptThread extends Thread {
        private BluetoothServerSocket serverSocket;
        
        public AcceptThread() {
            try {
                serverSocket = bluetoothAdapter.listenUsingRfcommWithServiceRecord(APP_NAME, MY_UUID);
            } catch (IOException | SecurityException e) {
                Log.e(TAG, "Server socket creation failed", e);
                mainHandler.post(() -> {
                    statusText.setText("Server failed to start");
                    btnStartServer.setEnabled(true);
                    Toast.makeText(BluetoothChatActivity.this, "Failed to start server. Check permissions.", Toast.LENGTH_LONG).show();
                });
            }
        }
        
        public void run() {
            BluetoothSocket socket;
            
            // Keep listening until exception occurs or socket is closed
            while (true) {
                try {
                    // This will block until a connection is accepted
                    socket = serverSocket.accept();
                    
                    if (socket != null) {
                        // Create final reference for lambda
                        final BluetoothSocket finalSocket = socket;
                        
                        // Connection accepted
                        mainHandler.post(() -> {
                            statusText.setText("Client connected!");
                            startConnectedThread(finalSocket);
                            sendUsernameHandshake();
                        });
                        
                        // Wait for this connection to finish before accepting new ones
                        while (isConnected) {
                            Thread.sleep(1000);
                        }
                    }
                } catch (IOException e) {
                    Log.e(TAG, "Server socket accept failed", e);
                    break;
                } catch (InterruptedException e) {
                    Log.e(TAG, "Accept thread interrupted", e);
                    break;
                }
            }
        }
        
        public void cancel() {
            try {
                if (serverSocket != null) {
                    serverSocket.close();
                }
            } catch (IOException e) {
                Log.e(TAG, "Error closing server socket", e);
            }
        }
    }
    
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        
        if (requestCode == REQUEST_BLUETOOTH_PERMISSIONS) {
            boolean allGranted = true;
            java.util.List<String> deniedPermissions = new java.util.ArrayList<>();
            
            for (int i = 0; i < permissions.length; i++) {
                if (grantResults[i] != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    deniedPermissions.add(permissions[i]);
                }
            }
            
            if (allGranted) {
                Toast.makeText(this, "Permissions granted! You can now use Bluetooth features.", Toast.LENGTH_SHORT).show();
                Log.d(TAG, "All Bluetooth permissions granted");
                // Re-initialize Bluetooth after permissions granted
                initBluetooth();
            } else {
                Log.w(TAG, "Some permissions denied: " + deniedPermissions);
                
                // Show specific guidance based on Android version
                String message;
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                    message = "Bluetooth permissions are required. Please go to Settings > Apps > P2P Chat > Permissions and enable Nearby devices.";
                } else {
                    message = "Location permission is required for Bluetooth discovery. Please go to Settings > Apps > P2P Chat > Permissions and enable Location.";
                }
                
                new AlertDialog.Builder(this)
                    .setTitle("Permissions Required")
                    .setMessage(message)
                    .setPositiveButton("Open Settings", (dialog, which) -> {
                        Intent intent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        intent.setData(android.net.Uri.fromParts("package", getPackageName(), null));
                        startActivity(intent);
                    })
                    .setNegativeButton("Cancel", null)
                    .show();
            }
        }
    }
    
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        
        if (requestCode == REQUEST_ENABLE_BT) {
            if (resultCode == RESULT_OK) {
                Toast.makeText(this, "Bluetooth enabled", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "Bluetooth is required for this app", Toast.LENGTH_LONG).show();
            }
        } else if (requestCode == REQUEST_DISCOVERABLE) {
            if (resultCode > 0) {
                Toast.makeText(this, "Device is now discoverable for " + resultCode + " seconds", Toast.LENGTH_SHORT).show();
            }
        }
    }
    
    @Override
    protected void onDestroy() {
        super.onDestroy();
        
        try {
            if (receiver != null) {
                unregisterReceiver(receiver);
            }
        } catch (IllegalArgumentException e) {
            Log.e(TAG, "Receiver not registered", e);
        }
        
        if (connectedThread != null) {
            connectedThread.cancel();
        }
        
        if (acceptThread != null) {
            acceptThread.cancel();
            acceptThread.interrupt();
        }
        
        if (clientSocket != null) {
            try {
                clientSocket.close();
            } catch (IOException e) {
                Log.e(TAG, "Error closing client socket", e);
            }
        }
        
        try {
            if (bluetoothAdapter != null && bluetoothAdapter.isDiscovering()) {
                bluetoothAdapter.cancelDiscovery();
            }
        } catch (SecurityException e) {
            Log.e(TAG, "Permission error cancelling discovery", e);
        }
    }
}
