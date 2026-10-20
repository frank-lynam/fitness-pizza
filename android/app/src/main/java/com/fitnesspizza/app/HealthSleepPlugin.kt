package com.fitnesspizza.app

import android.content.Intent
import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Duration
import java.time.Instant

/**
 * Reads sleep sessions from Health Connect, where Google Health (Fitbit), Samsung Health and
 * others write them. Read-only: the app never writes to Health Connect.
 *
 * JS: Capacitor.Plugins.HealthSleep.status() / requestPermission() / readSleep({ since }) / openSettings()
 */
@CapacitorPlugin(name = "HealthSleep")
class HealthSleepPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val readSleepPermission = HealthPermission.getReadPermission(SleepSessionRecord::class)
    private val contract = PermissionController.createRequestPermissionResultContract()

    private fun sdkStatus(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return "unsupported"
        return when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "needs_update"
            else -> "not_installed"
        }
    }

    private fun client(): HealthConnectClient? =
        if (sdkStatus() == "available") HealthConnectClient.getOrCreate(context) else null

    private fun granted(c: HealthConnectClient, call: PluginCall) {
        scope.launch {
            try {
                val ok = c.permissionController.getGrantedPermissions().contains(readSleepPermission)
                call.resolve(JSObject().put("status", "available").put("granted", ok))
            } catch (e: Exception) {
                call.reject(e.message ?: e.toString())
            }
        }
    }

    /** { status: available | needs_update | not_installed | unsupported, granted } */
    @PluginMethod
    fun status(call: PluginCall) {
        val c = client()
        if (c == null) {
            call.resolve(JSObject().put("status", sdkStatus()).put("granted", false))
            return
        }
        granted(c, call)
    }

    /** Shows Health Connect's permission screen; resolves like status(). */
    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (client() == null) {
            call.resolve(JSObject().put("status", sdkStatus()).put("granted", false))
            return
        }
        startActivityForResult(call, contract.createIntent(context, setOf(readSleepPermission)), "permissionResult")
    }

    @ActivityCallback
    private fun permissionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val c = client() ?: return call.resolve(JSObject().put("status", sdkStatus()).put("granted", false))
        granted(c, call)    // ask again rather than trust the result: it's empty when nothing changed
    }

    /**
     * Sleep sessions that end after `since` (epoch ms; default 30 days ago):
     * { sessions: [{ id, start, end, source, stages?: { deep, light, rem, awake, asleep } (minutes) }] }
     */
    @PluginMethod
    fun readSleep(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect isn't available")
        val since = call.getLong("since") ?: (System.currentTimeMillis() - 30L * 86_400_000L)
        scope.launch {
            try {
                val sessions = JSArray()
                var token: String? = null
                do {
                    val request = ReadRecordsRequest(
                        SleepSessionRecord::class,
                        TimeRangeFilter.after(Instant.ofEpochMilli(since)),
                        pageToken = token
                    )
                    val response = withContext(Dispatchers.IO) { c.readRecords(request) }
                    for (r in response.records) sessions.put(toJs(r))
                    token = response.pageToken
                } while (token != null)
                call.resolve(JSObject().put("sessions", sessions))
            } catch (e: SecurityException) {
                call.reject("permission")
            } catch (e: Exception) {
                call.reject(e.message ?: e.toString())
            }
        }
    }

    /** Opens Health Connect's own settings (to change or revoke access). */
    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            val intent = Intent(HealthConnectClient.getHealthConnectManageDataIntent(context))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message ?: e.toString())
        }
    }

    private fun toJs(r: SleepSessionRecord): JSObject {
        val o = JSObject()
        o.put("id", r.metadata.id)
        o.put("start", r.startTime.toEpochMilli())
        o.put("end", r.endTime.toEpochMilli())
        o.put("source", r.metadata.dataOrigin.packageName)
        if (r.stages.isNotEmpty()) {
            val minutes = linkedMapOf("deep" to 0L, "light" to 0L, "rem" to 0L, "awake" to 0L, "asleep" to 0L)
            for (s in r.stages) {
                val key = when (s.stage) {
                    SleepSessionRecord.STAGE_TYPE_DEEP -> "deep"
                    SleepSessionRecord.STAGE_TYPE_LIGHT -> "light"
                    SleepSessionRecord.STAGE_TYPE_REM -> "rem"
                    SleepSessionRecord.STAGE_TYPE_AWAKE,
                    SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
                    SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> "awake"
                    else -> "asleep"
                }
                minutes[key] = minutes.getValue(key) + Duration.between(s.startTime, s.endTime).toMinutes()
            }
            val stages = JSObject()
            minutes.forEach { (k, v) -> stages.put(k, v) }
            o.put("stages", stages)
        }
        return o
    }
}
