package io.github.ddpdantespixel.moyritm

/** Pure elapsed-time state machine. Neither React, wall-clock changes nor audio own time. */
internal data class StretchSession(
    val id: String,
    val plan: Int = 2,
    val status: String = "running",
    val elapsedMs: Long = 0,
    val anchorMs: Long,
    val startedAt: Long,
    val dateId: String,
    val delivered: Int = 0,
    val sound: Boolean = true,
    val vibration: Boolean = true,
    val boot: Int = 0,
    val revision: Long = 0,
) {
    fun position(now: Long): Long = elapsedMs + if (status == "running") (now - anchorMs).coerceAtLeast(0) else 0
    fun elapsed(now: Long): Long = position(now).coerceIn(0, TOTAL)
    fun stage(now: Long): Int = bounds(plan).count { elapsed(now) >= it }.coerceAtMost(4)
    fun remainingStage(now: Long): Long = (bounds(plan)[stage(now)] - elapsed(now)).coerceAtLeast(0)
    fun due(now: Long): Int = bounds(plan).count { elapsed(now) >= it }

    companion object {
        const val TOTAL = 840_000L
        val CURRENT = longArrayOf(300_000, 360_000, 420_000, 540_000, TOTAL)
        val LEGACY = longArrayOf(300_000, 360_000, 420_000, 540_000, TOTAL)
        fun bounds(plan: Int): LongArray = if (plan == 1) LEGACY else CURRENT
        fun names(plan: Int): Array<String> = if (plan == 1)
            arrayOf("90/90", "Переход", "Бабочка", "Фигура 4", "Поза ребёнка") else
            arrayOf("Поза ребёнка", "Фигура «4», левая нога", "Фигура «4», правая нога", "Бабочка", "90/90")
    }
}

internal data class StretchAdvance(val state: StretchSession, val boundary: Int = 0, val audible: Boolean = false, val late: Boolean = false)

internal object StretchClock {
    fun advance(s: StretchSession, now: Long): StretchAdvance {
        if (s.status != "running") return StretchAdvance(s)
        val elapsed = s.elapsed(now)
        val due = s.due(now)
        if (due <= s.delivered) return StretchAdvance(s)
        val late = due != s.delivered + 1 || s.position(now) - StretchSession.bounds(s.plan)[due - 1] > 2_000
        val next = s.copy(status = if (due == 5) "completed" else "running", elapsedMs = elapsed,
            anchorMs = now, delivered = due, revision = s.revision + 1)
        return StretchAdvance(next, due, s.sound && !late, late)
    }

    fun pause(s: StretchSession, now: Long): StretchSession {
        if (s.status != "running") return s
        val elapsed = s.elapsed(now)
        return s.copy(status = if (elapsed >= StretchSession.TOTAL) "completed" else "paused",
            elapsedMs = elapsed, anchorMs = now, delivered = s.due(now), revision = s.revision + 1)
    }

    fun resume(s: StretchSession, now: Long): StretchSession =
        if (s.status == "paused") s.copy(status = "running", anchorMs = now, revision = s.revision + 1) else s

    fun stop(s: StretchSession, now: Long): StretchSession =
        s.copy(status = "stopped", elapsedMs = s.elapsed(now), anchorMs = now, revision = s.revision + 1)

    /** A killed/rebooted process never restarts background audio or replays old signals. */
    fun recover(s: StretchSession, now: Long, boot: Int): StretchSession {
        if (s.status != "running") return s
        val elapsed = if (s.boot == boot && now >= s.anchorMs) s.elapsed(now) else s.elapsedMs
        val completed = elapsed >= StretchSession.TOTAL
        return s.copy(status = if (completed) "completed" else "paused", elapsedMs = elapsed,
            anchorMs = now, boot = boot, delivered = StretchSession.bounds(s.plan).count { elapsed >= it }, revision = s.revision + 1)
    }
}
