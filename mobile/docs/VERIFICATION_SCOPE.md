# Verification scope — OpsCore Mobile v0.1.1

Static contract verification was added for the mobile source. The previous v0.1.0 implementation contained a real integration defect: offline `appointment_checkin` queued the work-order ID even though OpsCore `/api/v1/sync` expects an appointment ID. v0.1.1 resolves this by loading appointments for the signed-in technician and refusing check-in when no matching appointment exists.

Not verified: physical Android/iOS devices, native camera/GPS behavior, signed builds, App Store/Google Play submission, production HTTPS, and live backend deployment.
