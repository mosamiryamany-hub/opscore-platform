# OpsCore Mobile Buyer Value v0.1.16

The mobile app is the field execution surface for the same OpsCore tenant and operational records used by the office. The primary workflow is Today Mission → On My Way → GPS Check-in → Work → Evidence/Notes → Offline Queue → Sync → Audit.

Sync Center makes queued and failed local operations visible instead of hiding them. The app uses SecureStore for authentication material and SQLite only for durable local operation queuing.

This package does not claim physical Android/iOS validation, store signing, live push/SMS/WhatsApp, or production road-routing providers until those environments are actually connected and tested.


The Today Mission is cached locally after a successful server refresh so an already downloaded field schedule remains visible during a connectivity loss. New mutations still require server authorization and are queued for synchronization.
