'use strict';

/**
 * Deterministic feasibility filter. Routing distance/time must be supplied by
 * a verified provider; this module does not fabricate OSRM results.
 */
function eligibleAssignments(tasks, technicians) {
  return tasks.map(task => ({
    taskId: task.id,
    candidates: technicians.filter(t =>
      (!task.requiredSkills || task.requiredSkills.every(s => (t.skills || []).includes(s))) &&
      (!task.requiredEquipment || task.requiredEquipment.every(e => (t.equipment || []).includes(e))) &&
      (!task.window || (t.availableFrom <= task.window.end && t.availableTo >= task.window.start))
    ).map(t => t.id)
  }));
}
module.exports = { eligibleAssignments };
