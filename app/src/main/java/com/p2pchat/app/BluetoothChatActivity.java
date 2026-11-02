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
import android.widget.ImageButton;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.bottomnavigation.BottomNavigationView;

import org.osmdroid.config.Configuration;
import org.osmdroid.tileprovider.cachemanager.CacheManager;
import org.osmdroid.tileprovider.tilesource.TileSourceFactory;
import org.osmdroid.util.BoundingBox;
import org.osmdroid.util.GeoPoint;
import org.osmdroid.views.MapView;
import org.osmdroid.events.MapEventsReceiver;
import org.osmdroid.views.overlay.MapEventsOverlay;
import org.osmdroid.views.overlay.Marker;
import org.osmdroid.views.overlay.Polyline;
import org.osmdroid.views.overlay.mylocation.GpsMyLocationProvider;
import org.osmdroid.views.overlay.mylocation.MyLocationNewOverlay;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.UUID;

public class BluetoothChatActivity extends AppCompatActivity {
    private static final String TAG = "BluetoothChat";
    private static final UUID MY_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String APP_NAME = "P2PChat";
    private static final String PREFS_NAME = "P2PChatPrefs";
    private static final String KEY_USERNAME = "username";
    private static final String KEY_DEVICE_ID = "device_id";
    private static final int REQUEST_ENABLE_BT = 1;
    private static final int REQUEST_BLUETOOTH_PERMISSIONS = 2;
    private static final int REQUEST_DISCOVERABLE = 3;
    private static final int DEFAULT_TTL = 5;  // max relay hops a message may travel
    private static final long PRESENCE_INTERVAL_MS = 20000; // how often we announce ourselves
    private static final long CONTACT_TIMEOUT_MS = 60000;   // mark a contact offline after this
    
    // A person reachable somewhere in the mesh (learned via presence propagation).
    private static class Contact {
        String deviceId;
        String name;
        String pubKey;
        int seq;
        long lastSeen;
        double lat;
        double lon;
        boolean hasLocation;
    }
    
    // An addressed message we sent that is waiting for a delivery ACK (so we can retry).
    private static class Pending {
        Packet packet;
        int attempts;
        long lastSent;
        String preview;
        int uiIndex = -1;    // row in the message list to update with delivery status
        String baseText;     // the message text without any status suffix
    }
    
    private BluetoothAdapter bluetoothAdapter;
    private ArrayAdapter<String> deviceListAdapter;
    private ArrayAdapter<String> messageAdapter;
    private ArrayList<BluetoothDevice> discoveredDevices;
    
    private ListView messageList, contactsList;
    private EditText messageInput;
    private Button btnConnect, btnSendMessage;
    private TextView statusText, usernameDisplay, connectionIndicator, messageHeader;
    private ArrayAdapter<String> contactsAdapter;
    private final java.util.ArrayList<String> messageItems = new java.util.ArrayList<>();
    
    // Mesh-wide contacts learned via presence, and the currently selected chat target.
    private final java.util.LinkedHashMap<String, Contact> contacts = new java.util.LinkedHashMap<>();
    private final java.util.ArrayList<String> contactIdOrder = new java.util.ArrayList<>();
    private String currentTargetId = "";     // empty = broadcast to everyone
    private String currentTargetName = "";
    private int presenceSeq = 0;
    private Crypto crypto;
    
    // Addressed messages awaiting delivery confirmation, keyed by their msgId.
    private final java.util.concurrent.ConcurrentHashMap<String, Pending> pending =
            new java.util.concurrent.ConcurrentHashMap<>();
    private static final int MAX_ATTEMPTS = 4;
    private static final long RETRY_INTERVAL_MS = 5000;
    
    // Resend unacknowledged addressed messages until they're delivered or attempts run out.
    private final Runnable retryTask = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            for (Pending p : pending.values()) {
                if (now - p.lastSent >= RETRY_INTERVAL_MS) {
                    if (p.attempts >= MAX_ATTEMPTS) {
                        pending.remove(p.packet.msgId);
                        if (p.uiIndex >= 0 && p.uiIndex < messageItems.size()) {
                            messageItems.set(p.uiIndex, p.baseText + "  \u2717 not delivered");
                            messageAdapter.notifyDataSetChanged();
                        }
                    } else {
                        p.attempts++;
                        p.lastSent = now;
                        neighborManager.broadcast(p.packet, null);
                    }
                }
            }
            mainHandler.postDelayed(this, RETRY_INTERVAL_MS);
        }
    };
    
    private Button btnRelayMode;
    private BottomNavigationView bottomNav;
    private View sectionChat, sectionRelay, sectionMap, sectionSettings;
    private TextView tvSelfId, settingsDeviceId, relayStatus, mapStatus;
    private MapView map;
    private MyLocationNewOverlay myLocationOverlay;
    private final java.util.HashMap<String, Marker> peerMarkers = new java.util.HashMap<>();
    private Marker destMarker;      // pinned / long-pressed destination
    private Polyline routeLine;     // drawn route/direction line
    private boolean placingPin = false;   // true while waiting for a tap to drop a pin
    private final OfflineRouter offlineRouter = new OfflineRouter();
    private static final int REQUEST_LOCATION = 5;
    private static final double DOWNLOAD_RADIUS_KM = 3.0;
    private boolean relayMode = false;
    private boolean autoConnect = false;
    private int forwardedCount = 0;   // number of messages this device has relayed
    private static final int REQUEST_POST_NOTIFICATIONS = 4;
    private static final long RESCAN_INTERVAL_MS = 40000;   // re-scan to find/re-link neighbors
    // Bluetooth addresses we've already tried this scan cycle, to avoid hammering the same device.
    private final java.util.Set<String> attemptedAddresses =
            java.util.Collections.synchronizedSet(new java.util.HashSet<>());
    
    // Periodically re-run discovery so a relay keeps finding and reconnecting to neighbors.
    private final Runnable rescanTask = new Runnable() {
        @Override
        public void run() {
            if (autoConnect) {
                attemptedAddresses.clear();   // allow retrying devices that dropped
                discoverDevices();
                mainHandler.postDelayed(this, RESCAN_INTERVAL_MS);
            }
        }
    };
    
    // Periodically announce our presence and expire stale contacts.
    private final Runnable presenceTask = new Runnable() {
        @Override
        public void run() {
            if (neighborManager != null && neighborManager.count() > 0) {
                emitPresence();
                emitLocation();
            }
            pruneContacts();
            mainHandler.postDelayed(this, PRESENCE_INTERVAL_MS);
        }
    };
    
    private AcceptThread acceptThread;
    private Handler mainHandler;
    private NeighborManager neighborManager;
    
    private boolean isServer = false;
    private boolean isConnected = false;
    private String username = "User";
    private String peerUsername = "Peer";
    private String deviceId = "";       // stable unique ID for this install (routing/identity)
    private String peerDeviceId = "";   // the connected peer's device ID

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // osmdroid must be configured before the MapView is inflated.
        Configuration.getInstance().load(getApplicationContext(),
                getSharedPreferences("osmdroid", MODE_PRIVATE));
        Configuration.getInstance().setUserAgentValue(getPackageName());
        
        setContentView(R.layout.activity_bluetooth_chat);
        
        mainHandler = new Handler(Looper.getMainLooper());
        neighborManager = new NeighborManager();
        
        initViews();
        loadUsername();
        initBluetooth();
        setupClickListeners();
        
        // Start periodic presence announcements + contact expiry, and message retries.
        mainHandler.postDelayed(presenceTask, PRESENCE_INTERVAL_MS);
        mainHandler.postDelayed(retryTask, RETRY_INTERVAL_MS);
        
        // Load a previously downloaded offline routing graph, if present.
        loadOfflineRoutingIfAvailable();
        
        // Show username dialog if not set
        if (username.equals("User")) {
            showUsernameDialog();
        }
    }
    
    private void initViews() {
        messageList = findViewById(R.id.message_list);
        contactsList = findViewById(R.id.contacts_list);
        messageInput = findViewById(R.id.message_input);
        btnConnect = findViewById(R.id.btn_connect);
        btnRelayMode = findViewById(R.id.btn_relay_mode);
        btnSendMessage = findViewById(R.id.btn_send_message);
        statusText = findViewById(R.id.status_text);
        usernameDisplay = findViewById(R.id.username_display);
        connectionIndicator = findViewById(R.id.connection_indicator);
        messageHeader = findViewById(R.id.message_header);
        tvSelfId = findViewById(R.id.tv_self_id);
        settingsDeviceId = findViewById(R.id.settings_device_id);
        relayStatus = findViewById(R.id.relay_status);
        mapStatus = findViewById(R.id.map_status);
        map = findViewById(R.id.map);
        bottomNav = findViewById(R.id.bottom_nav);
        sectionChat = findViewById(R.id.section_chat);
        sectionRelay = findViewById(R.id.section_relay);
        sectionMap = findViewById(R.id.section_map);
        sectionSettings = findViewById(R.id.section_settings);
        setupMap();
        setupBottomNav();
        updateConnectionIndicator(false);
        
        discoveredDevices = new ArrayList<>();
        deviceListAdapter = new ArrayAdapter<>(this, R.layout.list_item_device);
        messageAdapter = new ArrayAdapter<>(this, R.layout.list_item_message, messageItems);
        contactsAdapter = new ArrayAdapter<>(this, R.layout.list_item_device);
        
        messageList.setAdapter(messageAdapter);
        contactsList.setAdapter(contactsAdapter);
    }
    
    private void loadUsername() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        username = prefs.getString(KEY_USERNAME, "User");
        
        // Generate a stable, unique device ID on first launch and reuse it forever.
        // This is what identifies a device for routing, so two users with the same
        // display name are never confused.
        deviceId = prefs.getString(KEY_DEVICE_ID, null);
        if (deviceId == null || deviceId.isEmpty()) {
            deviceId = UUID.randomUUID().toString();
            prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply();
        }
        
        // Load (or generate) this device's encryption key pair.
        crypto = new Crypto(prefs);
        
        updateUsernameDisplay();
    }
    
    // Short, human-readable tag from the device ID (last 4 chars) used to tell apart
    // people who picked the same display name.
    private String shortId(String id) {
        if (id == null || id.length() < 4) {
            return "----";
        }
        return id.substring(id.length() - 4).toUpperCase();
    }
    
    private void saveUsername(String name) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit().putString(KEY_USERNAME, name).apply();
        username = name;
        updateUsernameDisplay();
        // Let the mesh know our new name.
        if (neighborManager != null && neighborManager.count() > 0) {
            emitPresence();
        }
    }
    
    private void updateUsernameDisplay() {
        if (usernameDisplay != null) {
            usernameDisplay.setText("You: " + username + "  #" + shortId(deviceId));
        }
        if (tvSelfId != null) {
            tvSelfId.setText("#" + shortId(deviceId));
        }
        if (settingsDeviceId != null) {
            settingsDeviceId.setText("Device ID: " + deviceId);
        }
    }
    
    private void setupBottomNav() {
        if (bottomNav == null) {
            return;
        }
        bottomNav.setOnItemSelectedListener(item -> {
            int id = item.getItemId();
            if (id == R.id.nav_chat) {
                showSection(0);
                return true;
            } else if (id == R.id.nav_relay) {
                showSection(1);
                return true;
            } else if (id == R.id.nav_map) {
                showSection(2);
                return true;
            } else if (id == R.id.nav_settings) {
                showSection(3);
                return true;
            }
            return false;
        });
        showSection(0);
    }
    
    private void showSection(int index) {
        if (sectionChat != null) {
            sectionChat.setVisibility(index == 0 ? View.VISIBLE : View.GONE);
        }
        if (sectionRelay != null) {
            sectionRelay.setVisibility(index == 1 ? View.VISIBLE : View.GONE);
        }
        if (sectionMap != null) {
            sectionMap.setVisibility(index == 2 ? View.VISIBLE : View.GONE);
        }
        if (sectionSettings != null) {
            sectionSettings.setVisibility(index == 3 ? View.VISIBLE : View.GONE);
        }
    }
    
    private void setupMap() {
        if (map == null) {
            return;
        }
        map.setTileSource(TileSourceFactory.MAPNIK);
        map.setMultiTouchControls(true);
        map.getController().setZoom(6.0);
        map.getController().setCenter(new GeoPoint(20.5937, 78.9629));   // default: India center
        
        myLocationOverlay = new MyLocationNewOverlay(new GpsMyLocationProvider(this), map);
        if (hasLocationPermission()) {
            myLocationOverlay.enableMyLocation();
        }
        map.getOverlays().add(myLocationOverlay);
        
        // Long-press anywhere to get directions to that point.
        MapEventsReceiver eventsReceiver = new MapEventsReceiver() {
            @Override
            public boolean singleTapConfirmedHelper(GeoPoint p) {
                if (placingPin) {
                    placingPin = false;
                    placePin(p);
                    return true;
                }
                return false;
            }
            @Override
            public boolean longPressHelper(GeoPoint p) {
                promptDirections(p);
                return true;
            }
        };
        map.getOverlays().add(0, new MapEventsOverlay(eventsReceiver));
    }
    
    private boolean hasLocationPermission() {
        return checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }
    
    private java.io.File routingPbfFile() {
        return new java.io.File(getFilesDir(), "region.osm.pbf");
    }
    
    private java.io.File routingOsmFile() {
        return new java.io.File(getFilesDir(), "region.osm");
    }
    
    private java.io.File routingGraphFolder() {
        return new java.io.File(getFilesDir(), "gh-graph");
    }
    
    // Fetch the OSM road network for a bounding box (via Overpass) and build the
    // offline routing graph, so routing covers the same area as the downloaded map.
    private void downloadRoutingForBbox(final double west, final double south,
                                        final double east, final double north) {
        new Thread(() -> {
            String url = "https://overpass-api.de/api/map?bbox="
                    + west + "," + south + "," + east + "," + north;
            java.io.File osm = routingOsmFile();
            mainHandler.post(() -> {
                if (mapStatus != null) mapStatus.setText("Downloading road data for offline routing…");
            });
            boolean ok = downloadFile(url, osm);
            if (!ok || osm.length() == 0) {
                mainHandler.post(() -> {
                    if (mapStatus != null) mapStatus.setText("Map tiles downloading; road data failed (try a smaller area).");
                });
                return;
            }
            mainHandler.post(() -> {
                if (mapStatus != null) mapStatus.setText("Preparing offline routing…");
            });
            try {
                java.io.File graph = routingGraphFolder();
                deleteRecursively(graph);
                offlineRouter.loadOrImport(osm.getAbsolutePath(), graph.getAbsolutePath());
                mainHandler.post(() -> {
                    if (mapStatus != null) mapStatus.setText("Area ready — map + offline routing available.");
                });
            } catch (Throwable t) {
                Log.e(TAG, "Routing prep failed", t);
                mainHandler.post(() -> {
                    if (mapStatus != null) mapStatus.setText("Routing prep failed: " + t.getMessage());
                });
            }
        }).start();
    }
    
    // On startup, load a previously built routing graph so offline routing is ready.
    private void loadOfflineRoutingIfAvailable() {
        final java.io.File graph = routingGraphFolder();
        // Prefer the OSM (bbox) file, fall back to a downloaded .pbf; only the graph matters once built.
        final java.io.File data = routingOsmFile().exists() ? routingOsmFile() : routingPbfFile();
        String[] contents = graph.list();
        if (graph.exists() && contents != null && contents.length > 0) {
            new Thread(() -> {
                try {
                    offlineRouter.loadOrImport(data.getAbsolutePath(), graph.getAbsolutePath());
                    mainHandler.post(() -> {
                        if (mapStatus != null) mapStatus.setText("Offline routing ready.");
                    });
                } catch (Throwable t) {
                    Log.e(TAG, "Failed to load routing graph", t);
                }
            }).start();
        }
    }
    
    // Ask for a .osm.pbf URL, then download + prepare it for offline routing.
    private void promptDownloadRouting() {
        final EditText input = new EditText(this);
        input.setHint("https://…/your-region.osm.pbf");
        new AlertDialog.Builder(this)
                .setTitle("Download offline routing data")
                .setMessage("Paste a link to an OpenStreetMap .osm.pbf extract for your area "
                        + "(e.g. from Geofabrik or BBBike). Keep it small (a city/region) — large "
                        + "files take a long time and lots of memory to prepare on a phone.")
                .setView(input)
                .setPositiveButton("Download", (d, w) -> downloadRoutingData(input.getText().toString().trim()))
                .setNegativeButton("Cancel", null)
                .show();
    }
    
    private void downloadRoutingData(final String url) {
        if (url.isEmpty()) {
            Toast.makeText(this, "Please paste a .osm.pbf link", Toast.LENGTH_SHORT).show();
            return;
        }
        if (mapStatus != null) mapStatus.setText("Downloading routing data…");
        new Thread(() -> {
            java.io.File pbf = routingPbfFile();
            boolean ok = downloadFile(url, pbf);
            if (!ok) {
                mainHandler.post(() -> {
                    if (mapStatus != null) mapStatus.setText("Routing download failed. Check the link and your connection.");
                });
                return;
            }
            mainHandler.post(() -> {
                if (mapStatus != null) mapStatus.setText("Preparing offline routing… this can take a while.");
            });
            try {
                // Rebuild the graph from the new data.
                java.io.File graph = routingGraphFolder();
                deleteRecursively(graph);
                offlineRouter.loadOrImport(pbf.getAbsolutePath(), graph.getAbsolutePath());
                mainHandler.post(() -> {
                    if (mapStatus != null) mapStatus.setText("Offline routing ready — Direction now works with no internet.");
                });
            } catch (Throwable t) {
                Log.e(TAG, "Routing prep failed", t);
                mainHandler.post(() -> {
                    if (mapStatus != null) mapStatus.setText("Couldn't prepare routing: " + t.getMessage());
                });
            }
        }).start();
    }
    
    private boolean downloadFile(String urlStr, java.io.File dest) {
        java.net.HttpURLConnection conn = null;
        try {
            conn = (java.net.HttpURLConnection) new java.net.URL(urlStr).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(60000);
            if (conn.getResponseCode() != 200) {
                return false;
            }
            final int total = conn.getContentLength();
            java.io.InputStream in = conn.getInputStream();
            java.io.FileOutputStream out = new java.io.FileOutputStream(dest);
            byte[] buf = new byte[8192];
            int n;
            long got = 0;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                got += n;
                if (total > 0) {
                    final int pct = (int) (got * 100 / total);
                    mainHandler.post(() -> {
                        if (mapStatus != null) mapStatus.setText("Downloading routing data… " + pct + "%");
                    });
                }
            }
            out.close();
            in.close();
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Routing download error", e);
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
    
    private void deleteRecursively(java.io.File f) {
        if (f == null || !f.exists()) {
            return;
        }
        if (f.isDirectory()) {
            java.io.File[] children = f.listFiles();
            if (children != null) {
                for (java.io.File c : children) {
                    deleteRecursively(c);
                }
            }
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
    
    // Drop a pin at the tapped point and show a popup with a Direction button.
    private void placePin(final GeoPoint p) {
        if (destMarker == null) {
            destMarker = new Marker(map);
            destMarker.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM);
            map.getOverlays().add(destMarker);
        }
        destMarker.setPosition(p);
        destMarker.setTitle("Pinned location");
        map.invalidate();
        
        String coords = String.format(java.util.Locale.US, "Lat %.5f, Lon %.5f",
                p.getLatitude(), p.getLongitude());
        showDirectionDialog("Location pinned", coords, p);
    }
    
    // Ask whether to route to a point, choosing driving or walking.
    private void promptDirections(final GeoPoint dest) {
        showDirectionDialog("Directions", "Choose how to travel to this point:", dest);
    }
    
    private void showDirectionDialog(String title, String message, final GeoPoint dest) {
        new AlertDialog.Builder(this)
                .setTitle(title)
                .setMessage(message)
                .setPositiveButton("Drive", (d, w) -> showRoute(dest, OfflineRouter.VEHICLE_CAR))
                .setNeutralButton("Walk", (d, w) -> showRoute(dest, OfflineRouter.VEHICLE_FOOT))
                .setNegativeButton("Close", null)
                .show();
    }
    
    // Draw a route to the destination. Prefers offline GraphHopper routing, then
    // online road routing, then a straight-line guide as a last resort.
    private void showRoute(final GeoPoint dest, final String vehicle) {
        if (!hasLocationPermission()) {
            requestPermissions(new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION}, REQUEST_LOCATION);
            return;
        }
        android.location.Location my = getLastKnownLocation();
        if (my == null) {
            Toast.makeText(this, "Can't get your location yet — tap My Location first.", Toast.LENGTH_SHORT).show();
            return;
        }
        final GeoPoint start = new GeoPoint(my.getLatitude(), my.getLongitude());
        
        if (destMarker == null) {
            destMarker = new Marker(map);
            destMarker.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM);
            map.getOverlays().add(destMarker);
        }
        destMarker.setPosition(dest);
        destMarker.setTitle("Destination");
        map.invalidate();
        
        if (mapStatus != null) {
            mapStatus.setText("Finding route…");
        }
        final String modeLabel = OfflineRouter.VEHICLE_FOOT.equals(vehicle) ? "walking" : "driving";
        
        new Thread(() -> {
            java.util.List<GeoPoint> path = null;
            boolean usedOffline = false;
            
            // 1. Offline GraphHopper route (fully offline).
            if (offlineRouter.isReady()) {
                java.util.List<double[]> r = offlineRouter.route(
                        start.getLatitude(), start.getLongitude(),
                        dest.getLatitude(), dest.getLongitude(), vehicle);
                if (r != null && r.size() >= 2) {
                    path = toGeoPoints(r);
                    usedOffline = true;
                }
            }
            // 2. Online road route (needs internet).
            if (path == null) {
                java.util.List<GeoPoint> road = fetchOsrmRoute(start, dest, vehicle);
                if (road != null && road.size() >= 2) {
                    path = road;
                }
            }
            
            final java.util.List<GeoPoint> finalPath = path;
            final boolean offline = usedOffline;
            mainHandler.post(() -> {
                float[] res = new float[1];
                android.location.Location.distanceBetween(
                        start.getLatitude(), start.getLongitude(),
                        dest.getLatitude(), dest.getLongitude(), res);
                double km = res[0] / 1000.0;
                if (finalPath != null) {
                    drawRoute(finalPath);
                    if (mapStatus != null) {
                        mapStatus.setText((offline ? "Offline " : "Online ") + modeLabel
                                + " route • straight-line " + String.format(java.util.Locale.US, "%.1f km", km));
                    }
                } else {
                    java.util.List<GeoPoint> line = new java.util.ArrayList<>();
                    line.add(start);
                    line.add(dest);
                    drawRoute(line);
                    if (mapStatus != null) {
                        mapStatus.setText(String.format(java.util.Locale.US,
                                "No road data — straight-line guide • %.1f km. Download routing data for offline routes.", km));
                    }
                }
                map.getController().animateTo(dest);
            });
        }).start();
    }
    
    private java.util.List<GeoPoint> toGeoPoints(java.util.List<double[]> pts) {
        java.util.List<GeoPoint> out = new java.util.ArrayList<>();
        for (double[] p : pts) {
            out.add(new GeoPoint(p[0], p[1]));
        }
        return out;
    }
    
    private void drawRoute(java.util.List<GeoPoint> points) {
        if (routeLine != null) {
            map.getOverlays().remove(routeLine);
        }
        routeLine = new Polyline(map);
        routeLine.setPoints(points);
        routeLine.getOutlinePaint().setColor(0xFF2196F3);
        routeLine.getOutlinePaint().setStrokeWidth(10f);
        map.getOverlays().add(routeLine);
        map.invalidate();
    }
    
    // Query the public OSRM server for a route. Returns null if offline/unavailable.
    private java.util.List<GeoPoint> fetchOsrmRoute(GeoPoint start, GeoPoint end, String vehicle) {
        java.net.HttpURLConnection conn = null;
        try {
            String profile = OfflineRouter.VEHICLE_FOOT.equals(vehicle) ? "walking" : "driving";
            String url = "https://router.project-osrm.org/route/v1/" + profile + "/"
                    + start.getLongitude() + "," + start.getLatitude() + ";"
                    + end.getLongitude() + "," + end.getLatitude()
                    + "?overview=full&geometries=geojson";
            conn = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            if (conn.getResponseCode() != 200) {
                return null;
            }
            java.io.BufferedReader br = new java.io.BufferedReader(
                    new java.io.InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
            br.close();
            org.json.JSONObject root = new org.json.JSONObject(sb.toString());
            org.json.JSONArray routes = root.optJSONArray("routes");
            if (routes == null || routes.length() == 0) {
                return null;
            }
            org.json.JSONArray coords = routes.getJSONObject(0)
                    .getJSONObject("geometry").getJSONArray("coordinates");
            java.util.List<GeoPoint> pts = new java.util.ArrayList<>();
            for (int i = 0; i < coords.length(); i++) {
                org.json.JSONArray c = coords.getJSONArray(i);
                pts.add(new GeoPoint(c.getDouble(1), c.getDouble(0)));   // [lon, lat]
            }
            return pts;
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }
    
    private void goToMyLocation() {
        if (!hasLocationPermission()) {
            requestPermissions(new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION}, REQUEST_LOCATION);
            return;
        }
        if (myLocationOverlay == null || map == null) {
            return;
        }
        myLocationOverlay.enableMyLocation();
        GeoPoint loc = myLocationOverlay.getMyLocation();
        if (loc != null) {
            map.getController().setZoom(17.0);
            map.getController().animateTo(loc);
        } else {
            Toast.makeText(this, "Getting your location…", Toast.LENGTH_SHORT).show();
        }
    }
    
    // Cache a ~3 km radius around your location (or map center) for offline use.
    private void downloadCurrentArea() {
        if (map == null) {
            return;
        }
        // Center on GPS if available, otherwise the current map center.
        double centerLat, centerLon;
        android.location.Location my = hasLocationPermission() ? getLastKnownLocation() : null;
        if (my != null) {
            centerLat = my.getLatitude();
            centerLon = my.getLongitude();
        } else {
            org.osmdroid.api.IGeoPoint c = map.getMapCenter();
            centerLat = c.getLatitude();
            centerLon = c.getLongitude();
        }
        
        // Convert a 3 km radius into a lat/lon bounding box.
        double dLat = DOWNLOAD_RADIUS_KM / 111.0;
        double dLon = DOWNLOAD_RADIUS_KM / (111.0 * Math.max(0.01, Math.cos(Math.toRadians(centerLat))));
        BoundingBox bb = new BoundingBox(centerLat + dLat, centerLon + dLon,
                centerLat - dLat, centerLon - dLon);
        
        // Also fetch the road network for the same area so offline routing matches the map.
        downloadRoutingForBbox(centerLon - dLon, centerLat - dLat, centerLon + dLon, centerLat + dLat);
        
        final int zoomMin = 13;   // street-level detail range useful for navigation
        final int zoomMax = 17;
        
        CacheManager cacheManager = new CacheManager(map);
        cacheManager.downloadAreaAsync(this, bb, zoomMin, zoomMax, new CacheManager.CacheManagerCallback() {
            @Override
            public void onTaskComplete() {
                if (mapStatus != null) mapStatus.setText("Area downloaded — available offline.");
            }
            @Override
            public void onTaskFailed(int errors) {
                if (mapStatus != null) mapStatus.setText("Download finished with " + errors + " errors.");
            }
            @Override
            public void updateProgress(int progress, int currentZoomLevel, int zoomMin2, int zoomMax2) {
                if (mapStatus != null) mapStatus.setText("Downloading… " + progress + "%");
            }
            @Override
            public void downloadStarted() {
                if (mapStatus != null) mapStatus.setText("Starting download…");
            }
            @Override
            public void setPossibleTilesInArea(int total) {
                if (mapStatus != null) mapStatus.setText("Downloading " + total + " tiles…");
            }
        });
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
        btnConnect.setOnClickListener(v -> connect());
        btnSendMessage.setOnClickListener(v -> sendMessage());
        if (btnRelayMode != null) {
            btnRelayMode.setOnClickListener(v -> toggleRelayMode());
        }
        
        Button btnPermissions = findViewById(R.id.btn_permissions);
        if (btnPermissions != null) {
            btnPermissions.setOnClickListener(v -> checkAndShowPermissionStatus());
        }
        
        Button btnMyLocation = findViewById(R.id.btn_my_location);
        if (btnMyLocation != null) {
            btnMyLocation.setOnClickListener(v -> goToMyLocation());
        }
        Button btnDownloadArea = findViewById(R.id.btn_download_area);
        if (btnDownloadArea != null) {
            btnDownloadArea.setOnClickListener(v -> downloadCurrentArea());
        }
        View btnPlacePin = findViewById(R.id.btn_place_pin);
        if (btnPlacePin != null) {
            btnPlacePin.setOnClickListener(v -> {
                placingPin = true;
                Toast.makeText(this, "Tap on the map to drop a pin", Toast.LENGTH_SHORT).show();
            });
        }
        Button btnDownloadRouting = findViewById(R.id.btn_download_routing);
        if (btnDownloadRouting != null) {
            btnDownloadRouting.setOnClickListener(v -> promptDownloadRouting());
        }
        
        // Edit button to change the username
        ImageButton btnEditUsername = findViewById(R.id.btn_edit_username);
        if (btnEditUsername != null) {
            btnEditUsername.setOnClickListener(v -> showUsernameDialog());
        }
        
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
        
        Button btnLinkDevice = findViewById(R.id.btn_link_device);
        if (btnLinkDevice != null) {
            btnLinkDevice.setOnClickListener(v -> showNearbyDevicesDialog());
        }
        
        // Tap a person in the mesh to direct your messages to them (routed via relays).
        contactsList.setOnItemClickListener((parent, view, position, id) -> {
            if (position < contactIdOrder.size()) {
                currentTargetId = contactIdOrder.get(position);
                Contact c = contacts.get(currentTargetId);
                currentTargetName = (c != null) ? c.name : "";
                updateMessageHeader();
                rebuildContactsUi();
            }
        });
        
        // Long-press the messages header to clear the target and broadcast to everyone.
        if (messageHeader != null) {
            messageHeader.setOnLongClickListener(v -> {
                currentTargetId = "";
                currentTargetName = "";
                updateMessageHeader();
                rebuildContactsUi();
                Toast.makeText(this, "Now messaging everyone", Toast.LENGTH_SHORT).show();
                return true;
            });
        }
    }
    
    private void updateMessageHeader() {
        if (messageHeader == null) {
            return;
        }
        if (currentTargetId == null || currentTargetId.isEmpty()) {
            messageHeader.setText("💬 Messages (everyone)");
        } else {
            messageHeader.setText("💬 To: " + currentTargetName + " #" + shortId(currentTargetId));
        }
    }
    
    // Decrypt (if needed) and show an incoming message.
    private void deliverMessage(Packet pkt) {
        final String senderLabel = (pkt.name != null && !pkt.name.isEmpty()) ? pkt.name : "Peer";
        String body = pkt.payload;
        String lock = "";
        if (Crypto.isEncrypted(body)) {
            String decrypted = crypto.decrypt(body);
            if (decrypted != null) {
                body = decrypted;
                lock = " \uD83D\uDD12";
            } else {
                body = "[encrypted message – can't decrypt]";
            }
        }
        final String text = body;
        final String lockIcon = lock;
        mainHandler.post(() -> messageAdapter.add(senderLabel + lockIcon + ": " + text));
    }
    
    // Send a delivery acknowledgement back toward the original sender.
    private void sendAck(Packet original) {
        Packet ack = new Packet(Packet.TYPE_ACK);
        ack.srcId = deviceId;
        ack.dstId = original.srcId;
        ack.payload = original.msgId;   // which message we're acknowledging
        ack.ttl = DEFAULT_TTL;
        ack.msgId = Packet.newMsgId();
        neighborManager.markSeen(ack.msgId);
        neighborManager.broadcast(ack, null);
    }
    
    // An ACK arrived for one of our sent messages: mark it delivered and stop retrying.
    private void markDelivered(String ackedMsgId) {
        if (ackedMsgId == null || ackedMsgId.isEmpty()) {
            return;
        }
        Pending p = pending.remove(ackedMsgId);
        if (p != null) {
            mainHandler.post(() -> {
                if (p.uiIndex >= 0 && p.uiIndex < messageItems.size()) {
                    messageItems.set(p.uiIndex, p.baseText + "  \u2713\u2713 delivered");
                    messageAdapter.notifyDataSetChanged();
                }
            });
        }
    }
    
    // Share our GPS position into the mesh so peers can plot us on their map.
    private void emitLocation() {
        if (!hasLocationPermission()) {
            return;
        }
        android.location.Location loc = getLastKnownLocation();
        if (loc == null) {
            return;
        }
        Packet p = new Packet(Packet.TYPE_LOCATION);
        p.srcId = deviceId;
        p.name = username;
        p.lat = loc.getLatitude();
        p.lon = loc.getLongitude();
        p.ttl = DEFAULT_TTL;
        p.msgId = Packet.newMsgId();
        neighborManager.markSeen(p.msgId);
        neighborManager.broadcast(p, null);
    }
    
    private android.location.Location getLastKnownLocation() {
        try {
            android.location.LocationManager lm =
                    (android.location.LocationManager) getSystemService(LOCATION_SERVICE);
            if (lm == null) {
                return null;
            }
            android.location.Location best = null;
            for (String prov : lm.getProviders(true)) {
                android.location.Location l = lm.getLastKnownLocation(prov);
                if (l != null && (best == null || l.getTime() > best.getTime())) {
                    best = l;
                }
            }
            return best;
        } catch (SecurityException e) {
            return null;
        }
    }
    
    // Update a peer's stored location and their pin on the map (main thread).
    private void updatePeerLocation(String id, String name, double lat, double lon) {
        if (id == null || id.isEmpty()) {
            return;
        }
        synchronized (contacts) {
            Contact c = contacts.get(id);
            if (c == null) {
                c = new Contact();
                c.deviceId = id;
                c.seq = -1;
                contacts.put(id, c);
            }
            if (name != null && !name.isEmpty()) {
                c.name = name;
            }
            c.lat = lat;
            c.lon = lon;
            c.hasLocation = true;
            c.lastSeen = System.currentTimeMillis();
        }
        if (map == null) {
            return;
        }
        Marker marker = peerMarkers.get(id);
        if (marker == null) {
            marker = new Marker(map);
            marker.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM);
            map.getOverlays().add(marker);
            peerMarkers.put(id, marker);
        }
        marker.setPosition(new GeoPoint(lat, lon));
        String nm = (name != null && !name.isEmpty()) ? name : "Peer";
        marker.setTitle(nm + " #" + shortId(id));
        map.invalidate();
    }
    
    // Broadcast a PRESENCE announcement into the mesh so others learn we exist.
    private void emitPresence() {
        presenceSeq++;
        Packet p = new Packet(Packet.TYPE_PRESENCE);
        p.srcId = deviceId;
        p.name = username;
        p.pubKey = (crypto != null) ? crypto.getPublicKeyBase64() : "";
        p.seq = presenceSeq;
        p.ttl = DEFAULT_TTL;
        p.msgId = Packet.newMsgId();
        neighborManager.markSeen(p.msgId);
        neighborManager.broadcast(p, null);
    }
    
    // Record/refresh a contact learned from a PRESENCE packet.
    private void updateContact(String id, String name, String pubKey, int seq) {
        if (id == null || id.isEmpty()) {
            return;
        }
        synchronized (contacts) {
            Contact c = contacts.get(id);
            if (c == null) {
                c = new Contact();
                c.deviceId = id;
                c.seq = -1;
                contacts.put(id, c);
            }
            if (seq >= c.seq) {
                if (name != null && !name.isEmpty()) {
                    c.name = name;
                }
                if (pubKey != null && !pubKey.isEmpty()) {
                    c.pubKey = pubKey;
                }
                c.seq = seq;
            }
            c.lastSeen = System.currentTimeMillis();
        }
        mainHandler.post(this::rebuildContactsUi);
    }
    
    // Rebuild the "People Online" list from current contacts (main thread only).
    private void rebuildContactsUi() {
        if (contactsAdapter == null) {
            return;
        }
        contactsAdapter.clear();
        contactIdOrder.clear();
        long now = System.currentTimeMillis();
        synchronized (contacts) {
            for (Contact c : contacts.values()) {
                if (now - c.lastSeen <= CONTACT_TIMEOUT_MS) {
                    contactIdOrder.add(c.deviceId);
                    String marker = c.deviceId.equals(currentTargetId) ? "   ✓ (chatting)" : "";
                    String nm = (c.name != null && !c.name.isEmpty()) ? c.name : "Unknown";
                    contactsAdapter.add(nm + " #" + shortId(c.deviceId) + marker);
                }
            }
        }
    }
    
    // Drop contacts that have gone silent for too long (called on main thread).
    private void pruneContacts() {
        long now = System.currentTimeMillis();
        synchronized (contacts) {
            java.util.Iterator<java.util.Map.Entry<String, Contact>> it = contacts.entrySet().iterator();
            while (it.hasNext()) {
                if (now - it.next().getValue().lastSeen > CONTACT_TIMEOUT_MS * 2) {
                    it.remove();
                }
            }
        }
        rebuildContactsUi();
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
        btnConnect.setEnabled(false);
        btnConnect.setText("Searching...");
    }
    
    // Single-tap flow: listen for connections, become discoverable, and scan for peers.
    private void connect() {
        if (bluetoothAdapter == null) {
            Toast.makeText(this, "Bluetooth not supported on this device", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!hasBluetoothPermissions()) {
            requestBluetoothPermissions();
            return;
        }
        try {
            if (!bluetoothAdapter.isEnabled()) {
                Toast.makeText(this, "Please enable Bluetooth", Toast.LENGTH_SHORT).show();
                startActivityForResult(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), REQUEST_ENABLE_BT);
                return;
            }
        } catch (SecurityException e) {
            requestBluetoothPermissions();
            return;
        }
        if (isConnected) {
            Toast.makeText(this, "Already connected to a device", Toast.LENGTH_SHORT).show();
            return;
        }
        // Start listening and request discoverability. Scanning auto-starts once
        // the discoverable prompt returns (see onActivityResult).
        startServer();
    }
    
    // Enter/leave hands-off Relay Mode: auto-accept, auto-connect, forward, and stay alive.
    private void toggleRelayMode() {
        if (!relayMode) {
            if (!hasBluetoothPermissions()) {
                requestBluetoothPermissions();
                return;
            }
            requestNotificationPermissionIfNeeded();
            
            relayMode = true;
            autoConnect = true;
            attemptedAddresses.clear();
            
            // Start listening + discoverable + scanning (same as Connect).
            startServer();
            // Keep re-scanning so we keep finding and reconnecting to neighbors.
            mainHandler.postDelayed(rescanTask, RESCAN_INTERVAL_MS);
            // Keep the process alive in the background.
            startRelayService();
            
            btnRelayMode.setText("Stop Relaying");
            btnRelayMode.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xFFD32F2F));
            updateRelayStatus();
            statusText.setText("Relay Mode: forwarding messages for nearby devices");
            Toast.makeText(this, "Relay Mode on. Allow discoverability, then leave the app running.", Toast.LENGTH_LONG).show();
        } else {
            relayMode = false;
            autoConnect = false;
            mainHandler.removeCallbacks(rescanTask);
            stopRelayService();
            
            btnRelayMode.setText("Start Relaying");
            btnRelayMode.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xFFFF9800));
            updateNeighborStatus();
            Toast.makeText(this, "Relay Mode off", Toast.LENGTH_SHORT).show();
        }
    }
    
    private void startRelayService() {
        Intent intent = new Intent(this, RelayService.class);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }
    
    private void stopRelayService() {
        stopService(new Intent(this, RelayService.class));
    }
    
    private void requestNotificationPermissionIfNeeded() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},
                        REQUEST_POST_NOTIFICATIONS);
            }
        }
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
    
    // Show discovered Bluetooth devices in a dialog so the Chat tab stays focused on
    // People Online + Messages. Tapping a device links to it; "Scan" re-runs discovery.
    private void showNearbyDevicesDialog() {
        ListView list = new ListView(this);
        list.setAdapter(deviceListAdapter);
        
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Nearby Devices")
                .setView(list)
                .setNeutralButton("Scan", null)
                .setNegativeButton("Close", null)
                .create();
        
        list.setOnItemClickListener((parent, view, position, id) -> {
            if (position < discoveredDevices.size()) {
                connectToDevice(discoveredDevices.get(position));
                dialog.dismiss();
            }
        });
        
        dialog.setOnShowListener(d -> {
            Button scan = dialog.getButton(AlertDialog.BUTTON_NEUTRAL);
            if (scan != null) {
                scan.setOnClickListener(v -> discoverDevices());   // re-scan without closing
            }
        });
        
        dialog.show();
        discoverDevices();   // kick off a fresh scan when opening
    }
    
    private void connectToDevice(BluetoothDevice device) {
        new Thread(() -> {
            BluetoothSocket socket = null;
            try {
                socket = device.createRfcommSocketToServiceRecord(MY_UUID);
                
                // Cancel discovery to improve connection speed
                try {
                    if (bluetoothAdapter.isDiscovering()) {
                        bluetoothAdapter.cancelDiscovery();
                    }
                } catch (SecurityException e) {
                    Log.e(TAG, "Permission error cancelling discovery", e);
                }
                
                mainHandler.post(() -> statusText.setText("Connecting..."));
                
                socket.connect();
                
                // Hand the connected socket to the neighbor manager as an outgoing link.
                neighborManager.addLink(socket, true);
                
            } catch (IOException e) {
                Log.e(TAG, "Connection failed", e);
                if (socket != null) {
                    try { socket.close(); } catch (IOException ignored) {}
                }
                mainHandler.post(() -> {
                    statusText.setText("Connection failed: " + e.getMessage());
                    Toast.makeText(BluetoothChatActivity.this, "Connection failed. Make sure the other device is running NINE.", Toast.LENGTH_LONG).show();
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
    
    private void sendMessage() {
        String message = messageInput.getText().toString().trim();
        if (message.isEmpty()) {
            Toast.makeText(this, "Please enter a message", Toast.LENGTH_SHORT).show();
            return;
        }
        if (neighborManager.count() == 0) {
            Toast.makeText(this, "Not connected to any device", Toast.LENGTH_SHORT).show();
            return;
        }
        // Address the message to the selected contact, or broadcast if none is selected.
        String dst = (currentTargetId != null) ? currentTargetId : "";
        String payload = message;
        boolean encrypted = false;
        
        // Encrypt addressed messages end-to-end when we have the recipient's public key,
        // so relays only carry ciphertext they cannot read.
        if (!dst.isEmpty()) {
            String recipientKey;
            synchronized (contacts) {
                Contact c = contacts.get(dst);
                recipientKey = (c != null) ? c.pubKey : null;
            }
            if (recipientKey != null && !recipientKey.isEmpty()) {
                String enc = crypto.encryptFor(recipientKey, message);
                if (enc != null) {
                    payload = enc;
                    encrypted = true;
                }
            }
            if (!encrypted) {
                Toast.makeText(this, "No encryption key for recipient yet — sending unencrypted", Toast.LENGTH_SHORT).show();
            }
        }
        
        Packet msg = Packet.message(deviceId, dst, username, payload, DEFAULT_TTL);
        neighborManager.markSeen(msg.msgId);   // don't re-deliver our own message if it echoes back
        neighborManager.broadcast(msg, null);
        
        String label = dst.isEmpty() ? username : (username + " → " + currentTargetName);
        String lockIcon = encrypted ? " \uD83D\uDD12" : "";
        String baseText = label + lockIcon + ": " + message;
        
        if (!dst.isEmpty()) {
            // Addressed message: show a "sending" marker and track it for delivery/retry.
            messageAdapter.add(baseText + "  (sending\u2026)");
            Pending pend = new Pending();
            pend.packet = msg;
            pend.attempts = 1;
            pend.lastSent = System.currentTimeMillis();
            pend.preview = message;
            pend.uiIndex = messageItems.size() - 1;
            pend.baseText = baseText;
            pending.put(msg.msgId, pend);
        } else {
            messageAdapter.add(baseText);
        }
        messageInput.setText("");
    }
    
    // Refresh the header status/dot based on how many neighbors are connected.
    private void updateNeighborStatus() {
        int count = neighborManager.count();
        isConnected = count > 0;
        updateConnectionIndicator(isConnected);
        if (count == 0) {
            statusText.setText("Not connected");
            btnConnect.setEnabled(true);
            btnConnect.setText("Connect");
        } else if (count == 1) {
            statusText.setText("Connected to: " + neighborManager.describeNeighbors());
        } else {
            statusText.setText(count + " devices connected: " + neighborManager.describeNeighbors());
        }
        updateRelayStatus();
    }
    
    // Live status shown on the Relay tab.
    private void updateRelayStatus() {
        if (relayStatus == null) {
            return;
        }
        int n = (neighborManager != null) ? neighborManager.count() : 0;
        if (relayMode) {
            relayStatus.setText("Relaying • " + n + " neighbor(s) • " + forwardedCount + " message(s) forwarded");
        } else {
            relayStatus.setText("Relay is off • " + n + " neighbor(s) connected");
        }
    }
    
    // Dispatch a packet received on a specific link. Runs on the link's read thread.
    private void onLinkPacket(Link link, Packet pkt) {
        if (pkt == null || pkt.type == null) {
            return;
        }
        switch (pkt.type) {
            case Packet.TYPE_HELLO: {
                // Learn the peer's identity and register the link by device ID (with dedup).
                link.peerId = pkt.srcId;
                link.peerName = (pkt.name != null && !pkt.name.isEmpty()) ? pkt.name : "Peer";
                neighborManager.registerPeer(link);
                // Announce ourselves right away so the new neighbor (and the mesh) learns us.
                emitPresence();
                mainHandler.post(() -> {
                    updateNeighborStatus();
                    Toast.makeText(this, link.peerName + " #" + shortId(link.peerId) + " connected", Toast.LENGTH_SHORT).show();
                });
                break;
            }
            case Packet.TYPE_MSG: {
                boolean isBroadcast = (pkt.dstId == null || pkt.dstId.isEmpty());
                boolean addressedToMe = !isBroadcast && pkt.dstId.equals(deviceId);
                boolean seen = neighborManager.hasSeen(pkt.msgId);
                
                if (addressedToMe) {
                    // Always acknowledge (even a duplicate) so a lost ACK can be recovered.
                    sendAck(pkt);
                    if (!seen) {
                        neighborManager.markSeen(pkt.msgId);
                        deliverMessage(pkt);
                    }
                    break;   // we're the destination; don't relay further
                }
                
                // Not for us: controlled flooding with dedup + TTL.
                if (seen) {
                    break;
                }
                neighborManager.markSeen(pkt.msgId);
                if (isBroadcast) {
                    deliverMessage(pkt);   // broadcasts are shown by everyone
                }
                pkt.ttl -= 1;
                if (pkt.ttl > 0) {
                    neighborManager.broadcast(pkt, link);   // exclude the link it came from
                    forwardedCount++;
                    mainHandler.post(this::updateRelayStatus);
                }
                break;
            }
            case Packet.TYPE_ACK: {
                // Delivery confirmation. Deliver to sender or relay onward.
                if (neighborManager.hasSeen(pkt.msgId)) {
                    break;
                }
                neighborManager.markSeen(pkt.msgId);
                if (pkt.dstId != null && pkt.dstId.equals(deviceId)) {
                    markDelivered(pkt.payload);   // payload carries the acknowledged msgId
                } else {
                    pkt.ttl -= 1;
                    if (pkt.ttl > 0) {
                        neighborManager.broadcast(pkt, link);
                    }
                }
                break;
            }
            case Packet.TYPE_PRESENCE: {
                // Learn who is reachable across the mesh, then flood the announcement onward.
                if (neighborManager.hasSeen(pkt.msgId)) {
                    break;
                }
                neighborManager.markSeen(pkt.msgId);
                if (pkt.srcId != null && !pkt.srcId.equals(deviceId)) {
                    updateContact(pkt.srcId, pkt.name, pkt.pubKey, pkt.seq);
                }
                pkt.ttl -= 1;
                if (pkt.ttl > 0) {
                    neighborManager.broadcast(pkt, link);
                }
                break;
            }
            case Packet.TYPE_LOCATION: {
                // Learn a peer's GPS position, plot it, then flood onward.
                if (neighborManager.hasSeen(pkt.msgId)) {
                    break;
                }
                neighborManager.markSeen(pkt.msgId);
                if (pkt.srcId != null && !pkt.srcId.equals(deviceId)) {
                    final Packet fp = pkt;
                    mainHandler.post(() -> updatePeerLocation(fp.srcId, fp.name, fp.lat, fp.lon));
                }
                pkt.ttl -= 1;
                if (pkt.ttl > 0) {
                    neighborManager.broadcast(pkt, link);
                }
                break;
            }
            default:
                // Unknown packet type; ignore.
                break;
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
                        }
                        // In auto-connect (Relay Mode), try to link to newly found devices
                        // automatically. Non-NINE devices simply fail the RFCOMM connect.
                        if (autoConnect && device.getAddress() != null
                                && attemptedAddresses.add(device.getAddress())) {
                            connectToDevice(device);
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
    
    /**
     * A single Bluetooth connection to one neighbor. Runs its own read thread and
     * sends a HELLO on start so both sides learn each other's device ID.
     */
    private class Link extends Thread {
        private final BluetoothSocket socket;
        private final boolean initiatedByUs;   // true if we dialed out; used for dedup tie-break
        private DataInputStream dataIn;
        private DataOutputStream dataOut;
        volatile String peerId = "";
        volatile String peerName = "Peer";
        private volatile boolean closed = false;
        
        Link(BluetoothSocket socket, boolean initiatedByUs) {
            this.socket = socket;
            this.initiatedByUs = initiatedByUs;
            try {
                dataIn = new DataInputStream(socket.getInputStream());
                dataOut = new DataOutputStream(socket.getOutputStream());
            } catch (IOException e) {
                Log.e(TAG, "Error creating link streams", e);
            }
        }
        
        boolean initiatedByUs() {
            return initiatedByUs;
        }
        
        public void run() {
            // Announce our identity first.
            writePacket(Packet.hello(deviceId, username));
            while (!closed) {
                try {
                    Packet pkt = Packet.readFrom(dataIn);
                    if (pkt == null) {
                        throw new IOException("Peer closed the connection");
                    }
                    onLinkPacket(this, pkt);
                } catch (IOException e) {
                    if (!closed) {
                        Log.e(TAG, "Link lost to #" + shortId(peerId), e);
                    }
                    neighborManager.remove(this);
                    break;
                }
            }
        }
        
        void writePacket(Packet p) {
            try {
                if (dataOut != null) {
                    p.writeTo(dataOut);
                }
            } catch (IOException e) {
                Log.e(TAG, "Error writing packet", e);
                neighborManager.remove(this);
            }
        }
        
        void close() {
            closed = true;
            try {
                socket.close();
            } catch (IOException e) {
                Log.e(TAG, "Error closing link socket", e);
            }
        }
    }
    
    /**
     * Holds all active neighbor links and provides broadcast/dedup helpers.
     * This is what makes multi-hop relaying possible: a device can be connected
     * to several neighbors at once and forward packets between them.
     */
    private class NeighborManager {
        // Keyed by peer device ID once HELLO is received.
        private final java.util.concurrent.ConcurrentHashMap<String, Link> neighbors =
                new java.util.concurrent.ConcurrentHashMap<>();
        // Links that have connected but not yet sent HELLO.
        private final java.util.Set<Link> pending =
                java.util.Collections.newSetFromMap(new java.util.concurrent.ConcurrentHashMap<>());
        // Recently seen message IDs (dedupe / loop prevention). Bounded FIFO.
        private final java.util.LinkedHashMap<String, Long> seen =
                new java.util.LinkedHashMap<String, Long>() {
                    @Override
                    protected boolean removeEldestEntry(java.util.Map.Entry<String, Long> eldest) {
                        return size() > 512;
                    }
                };
        
        void addLink(BluetoothSocket socket, boolean initiatedByUs) {
            Link link = new Link(socket, initiatedByUs);
            pending.add(link);
            link.start();
        }
        
        // Called when a HELLO is received on a link. Registers it by peer ID and
        // resolves duplicate links to the same peer (keep the one initiated by the
        // device with the lower ID).
        synchronized void registerPeer(Link link) {
            pending.remove(link);
            if (link.peerId == null || link.peerId.isEmpty()) {
                return;
            }
            Link existing = neighbors.get(link.peerId);
            if (existing != null && existing != link) {
                boolean weAreLower = deviceId.compareTo(link.peerId) < 0;
                // The lower-ID device is the canonical initiator. Keep the matching link.
                Link keep = weAreLower
                        ? (link.initiatedByUs() ? link : existing)
                        : (link.initiatedByUs() ? existing : link);
                Link drop = (keep == link) ? existing : link;
                drop.close();
                neighbors.put(link.peerId, keep);
            } else {
                neighbors.put(link.peerId, link);
            }
        }
        
        void remove(Link link) {
            pending.remove(link);
            if (link.peerId != null) {
                neighbors.remove(link.peerId, link);
            }
            link.close();
            mainHandler.post(BluetoothChatActivity.this::updateNeighborStatus);
        }
        
        int count() {
            return neighbors.size();
        }
        
        // Send a packet to every neighbor except the one it came from (split-horizon).
        void broadcast(Packet pkt, Link exclude) {
            for (Link link : neighbors.values()) {
                if (link != exclude) {
                    link.writePacket(pkt);
                }
            }
        }
        
        synchronized boolean hasSeen(String msgId) {
            return msgId != null && !msgId.isEmpty() && seen.containsKey(msgId);
        }
        
        synchronized void markSeen(String msgId) {
            if (msgId != null && !msgId.isEmpty()) {
                seen.put(msgId, System.currentTimeMillis());
            }
        }
        
        String describeNeighbors() {
            StringBuilder sb = new StringBuilder();
            for (Link link : neighbors.values()) {
                if (sb.length() > 0) {
                    sb.append(", ");
                }
                sb.append(link.peerName).append(" #").append(shortId(link.peerId));
            }
            return sb.toString();
        }
        
        void closeAll() {
            for (Link link : neighbors.values()) {
                link.close();
            }
            neighbors.clear();
            for (Link link : pending) {
                link.close();
            }
            pending.clear();
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
                    btnConnect.setEnabled(true);
                    btnConnect.setText("Connect");
                    Toast.makeText(BluetoothChatActivity.this, "Failed to start server. Check permissions.", Toast.LENGTH_LONG).show();
                });
            }
        }
        
        public void run() {
            // Keep listening and accept multiple simultaneous connections. Each accepted
            // socket becomes an incoming neighbor link.
            while (true) {
                try {
                    BluetoothSocket socket = serverSocket.accept();
                    if (socket != null) {
                        neighborManager.addLink(socket, false);
                    }
                } catch (IOException e) {
                    Log.e(TAG, "Server socket accept ended", e);
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
                Toast.makeText(this, "Discoverable for " + resultCode + "s. Searching for peers...", Toast.LENGTH_SHORT).show();
            }
            // Whether or not the user allowed discoverability, start scanning so we can
            // find the other device. This completes the single-tap Connect flow.
            if (!isConnected) {
                discoverDevices();
            }
        }
    }
    
    @Override
    protected void onResume() {
        super.onResume();
        if (map != null) {
            map.onResume();
        }
    }
    
    @Override
    protected void onPause() {
        super.onPause();
        if (map != null) {
            map.onPause();
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
        
        if (mainHandler != null) {
            mainHandler.removeCallbacks(presenceTask);
            mainHandler.removeCallbacks(rescanTask);
            mainHandler.removeCallbacks(retryTask);
        }
        
        if (relayMode) {
            stopRelayService();
        }
        
        if (neighborManager != null) {
            neighborManager.closeAll();
        }
        
        if (acceptThread != null) {
            acceptThread.cancel();
            acceptThread.interrupt();
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
