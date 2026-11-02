package com.p2pchat.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * A minimal foreground service that keeps NINE alive while it acts as a relay.
 *
 * Android aggressively kills background apps, which would drop the Bluetooth links
 * a relay depends on. Running as a foreground service (with a persistent, ongoing
 * notification) raises the process priority so relaying keeps working while the
 * phone is locked or in another app.
 *
 * The notification also makes it clear to the relay user that forwarding is active.
 */
public class RelayService extends Service {

    public static final String CHANNEL_ID = "nine_relay";
    public static final int NOTIFICATION_ID = 1001;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createChannel();

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("NINE is relaying")
                .setContentText("Forwarding messages for nearby devices")
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        // If the system kills us for memory, restart when possible.
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Relay Mode",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shown while NINE is forwarding messages as a relay");
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }
}
