# Field Check-in Contract — v0.1.2

The mobile client queues an `appointment_checkin` event with an `appointmentId`, latitude, longitude and optional accuracy.

The OpsCore server is authoritative: it resolves the appointment inside the caller's organization, requires the appointment technician to equal the authenticated actor, validates coordinate ranges, requires stored site coordinates, requires reported accuracy <=100 m, requires the claimed point to be within 200 m of the stored site coordinates, records the server timestamp and actor, transitions the appointment to `en_route`, and emits audit/activity evidence.

This is server-side proximity validation against the persisted site location, not proof against GPS spoofing. No claim is made that GPS is continuously tracked or that coordinates prove physical presence beyond the device/location provider and the configured validation radius.
