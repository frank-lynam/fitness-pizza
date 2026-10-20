package com.fitnesspizza.app

import android.content.Intent
import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateRequest
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
 * Reads sleep and workouts from Health Connect, where Google Health (Fitbit), Samsung Health and
 * others write them. Read-only: the app never writes to Health Connect.
 *
 * JS: Capacitor.Plugins.HealthSleep.status() / requestPermission({ kinds }) / readSleep({ since }) /
 *     readWorkouts({ since }) / openSettings()
 * (The plugin keeps its first name, HealthSleep, so the JS that already calls it stays the same.)
 */
@CapacitorPlugin(name = "HealthSleep")
class HealthSleepPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val readSleepPermission = HealthPermission.getReadPermission(SleepSessionRecord::class)
    private val readExercisePermission = HealthPermission.getReadPermission(ExerciseSessionRecord::class)
    private val readTotalCalories = HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class)
    private val readActiveCalories = HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)
    private val readDistance = HealthPermission.getReadPermission(DistanceRecord::class)
    private val kinds = mapOf(
        "sleep" to setOf(readSleepPermission),
        "workouts" to setOf(readExercisePermission, readTotalCalories, readActiveCalories, readDistance)
    )
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

    private fun unavailable() = JSObject().put("status", sdkStatus()).put("granted", false)
        .put("sleep", false).put("workouts", false)

    /** Resolves { status, granted (sleep, kept for older JS), sleep, workouts }. */
    private fun granted(c: HealthConnectClient, call: PluginCall) {
        scope.launch {
            try {
                val have = c.permissionController.getGrantedPermissions()
                val sleep = have.contains(readSleepPermission)
                call.resolve(JSObject().put("status", "available").put("granted", sleep).put("sleep", sleep)
                    .put("workouts", have.contains(readExercisePermission)))
            } catch (e: Exception) {
                call.reject(e.message ?: e.toString())
            }
        }
    }

    /** { status: available | needs_update | not_installed | unsupported, sleep, workouts } */
    @PluginMethod
    fun status(call: PluginCall) {
        val c = client() ?: return call.resolve(unavailable())
        granted(c, call)
    }

    /** Shows Health Connect's permission screen for { kinds: ['sleep', 'workouts'] } (default sleep); resolves like status(). */
    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (client() == null) return call.resolve(unavailable())
        val asked = call.getArray("kinds")?.toList<String>() ?: listOf("sleep")
        val perms = asked.flatMap { kinds[it] ?: emptySet() }.toSet()
        startActivityForResult(call, contract.createIntent(context, perms), "permissionResult")
    }

    @ActivityCallback
    private fun permissionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val c = client() ?: return call.resolve(unavailable())
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

    /**
     * Workouts that end after `since` (epoch ms; default 30 days ago), each with the calories and
     * distance its own app recorded during it (null where there's none, or no permission):
     * { workouts: [{ id, start, end, name, kind (Cardio | Core | Lifting), title, source, totalKcal, activeKcal, distanceM }] }
     */
    @PluginMethod
    fun readWorkouts(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect isn't available")
        val since = call.getLong("since") ?: (System.currentTimeMillis() - 30L * 86_400_000L)
        scope.launch {
            try {
                val have = c.permissionController.getGrantedPermissions()
                val metrics = buildSet {
                    if (readTotalCalories in have) add(TotalCaloriesBurnedRecord.ENERGY_TOTAL)
                    if (readActiveCalories in have) add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
                    if (readDistance in have) add(DistanceRecord.DISTANCE_TOTAL)
                }
                val out = JSArray()
                var token: String? = null
                do {
                    val request = ReadRecordsRequest(
                        ExerciseSessionRecord::class,
                        TimeRangeFilter.after(Instant.ofEpochMilli(since)),
                        pageToken = token
                    )
                    val response = withContext(Dispatchers.IO) { c.readRecords(request) }
                    for (r in response.records) {
                        val (name, kind) = exerciseName(r.exerciseType)
                        val o = JSObject()
                        o.put("id", r.metadata.id)
                        o.put("start", r.startTime.toEpochMilli())
                        o.put("end", r.endTime.toEpochMilli())
                        o.put("name", name)
                        o.put("kind", kind)
                        o.put("title", r.title ?: "")
                        o.put("source", r.metadata.dataOrigin.packageName)
                        if (metrics.isNotEmpty()) {
                            // Only what the session's own app recorded, so two apps can't double it
                            val totals = withContext(Dispatchers.IO) {
                                c.aggregate(AggregateRequest(metrics, TimeRangeFilter.between(r.startTime, r.endTime),
                                    setOf(r.metadata.dataOrigin)))
                            }
                            totals[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.let { o.put("totalKcal", it.inKilocalories) }
                            totals[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let { o.put("activeKcal", it.inKilocalories) }
                            totals[DistanceRecord.DISTANCE_TOTAL]?.let { o.put("distanceM", it.inMeters) }
                        }
                        out.put(o)
                    }
                    token = response.pageToken
                } while (token != null)
                call.resolve(JSObject().put("workouts", out))
            } catch (e: SecurityException) {
                call.reject("permission")
            } catch (e: Exception) {
                call.reject(e.message ?: e.toString())
            }
        }
    }

    /** Fitness Pizza's name and type for a Health Connect exercise type (names match the app's own). */
    private fun exerciseName(type: Int): Pair<String, String> = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "Treadmill" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "Outdoor Run" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "Walk" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "Hiking" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "Cycling" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "Stationary Bike" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "Elliptical" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "Rowing Machine" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE -> "Stair Climber" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING -> "Stairs" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL -> "Swimming" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "Open Water Swim" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "HIIT" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_DANCING -> "Dancing" to "Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "Yoga" to "Core"
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES -> "Pilates" to "Core"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING -> "Strength Training" to "Lifting"
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "Weightlifting" to "Lifting"
        ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS -> "Calisthenics" to "Lifting"
        else -> "Workout" to "Cardio"
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
