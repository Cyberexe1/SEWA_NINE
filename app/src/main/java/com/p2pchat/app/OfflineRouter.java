package com.p2pchat.app;

import com.graphhopper.GHRequest;
import com.graphhopper.GHResponse;
import com.graphhopper.GraphHopper;
import com.graphhopper.reader.osm.GraphHopperOSM;
import com.graphhopper.routing.util.EncodingManager;
import com.graphhopper.util.PointList;

import java.util.ArrayList;
import java.util.List;

/**
 * Offline road routing using GraphHopper.
 *
 * A GraphHopper graph is built once from an OpenStreetMap extract (.osm.pbf) that
 * the user downloads onto the device, then reused for fully offline routing for
 * both driving ("car") and walking ("foot").
 *
 * Import ({@link #loadOrImport}) is CPU/memory heavy and must run off the main
 * thread. After a successful import the graph folder is reused on later launches.
 *
 * Note: built against GraphHopper 1.0, the last version that runs cleanly on
 * Android. API differs from newer desktop GraphHopper releases.
 */
public class OfflineRouter {

    public static final String VEHICLE_CAR = "car";
    public static final String VEHICLE_FOOT = "foot";

    private GraphHopper hopper;
    private volatile boolean ready = false;

    public boolean isReady() {
        return ready;
    }

    /**
     * Load an existing graph folder, or import one from the given .osm.pbf if none
     * exists yet. Heavy — call on a background thread.
     */
    public synchronized void loadOrImport(String pbfPath, String graphFolder) {
        GraphHopper gh = new GraphHopperOSM().forMobile();
        gh.setDataReaderFile(pbfPath);
        gh.setGraphHopperLocation(graphFolder);
        gh.setEncodingManager(EncodingManager.create(VEHICLE_CAR + "," + VEHICLE_FOOT));
        // Disable Contraction Hierarchies so we can route both vehicles flexibly.
        gh.setCHEnabled(false);
        gh.importOrLoad();
        hopper = gh;
        ready = true;
    }

    /**
     * Compute a route. Returns a list of [lat, lon] points, or null if routing
     * is unavailable or failed. {@code vehicle} is "car" or "foot".
     */
    public synchronized List<double[]> route(double fromLat, double fromLon,
                                             double toLat, double toLon, String vehicle) {
        if (!ready || hopper == null) {
            return null;
        }
        try {
            GHRequest req = new GHRequest(fromLat, fromLon, toLat, toLon)
                    .setVehicle(vehicle)
                    .setWeighting("fastest");
            GHResponse rsp = hopper.route(req);
            if (rsp.hasErrors()) {
                return null;
            }
            PointList pl = rsp.getBest().getPoints();
            List<double[]> pts = new ArrayList<>();
            for (int i = 0; i < pl.getSize(); i++) {
                pts.add(new double[]{pl.getLatitude(i), pl.getLongitude(i)});
            }
            return pts;
        } catch (Exception e) {
            return null;
        }
    }

    public synchronized void close() {
        if (hopper != null) {
            hopper.close();
            hopper = null;
        }
        ready = false;
    }
}
