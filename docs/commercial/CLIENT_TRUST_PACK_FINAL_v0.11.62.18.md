# OpsCore v0.11.62.18 — Customer Trust Record
# سجل الثقة للعميل — OpsCore v0.11.62.18

**Record date / تاريخ السجل:** 18 November 2026 / 18 نوفمبر 2026  
**Status / الحالة:** Seller source-package closeout — `PASS_WITH_BUYER_RESIDUALS`  
**This is a buyer-diligence record, not a license, warranty, or Production certificate.**  
**هذا سجل فحص للعميل، وليس ترخيصًا أو ضمانًا أو شهادة اعتماد للإنتاج.**

---

## 1. Exact source-package identity / هوية حزمة المصدر

| Field | Verified value |
|---|---|
| Repository | `mosamiryamany-hub/opscore-platform` |
| Isolated release branch | `release/v0.11.62.18-commercial-source-package` |
| Release tag | `v0.11.62.18-commercial-source-package` |
| Source commit | `463163dd68aa76e43985a0ba872ccf88d16a0488` |
| Secure Release run | [#44390787189](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44390787189) |
| GitHub Release ID | `450480423` — draft / prerelease / unpublished |
| Archive filename | `OpsCore-release-v0.11.62.18-463163dd68aa-44390787189.zip` |
| Archive size | `2,387,461 bytes` |
| Archive SHA-256 | `1f150c26d53464555af633e00e100a64d80db2e58b89dc43a6818eef450c45b1` |
| External statement | `COMMERCIAL_RELEASE_STATEMENT-v0.11.62.18-463163dd68aa-44390787189.json` |
| Statement SHA-256 | `e094919396bb310e1e9a0a4a44d6e659774bbe495d67dc4bd32c64bd96a58dfe` |
| SHA-256 sidecar asset digest | `5a39cae233f1a8dc9fcc526d9869aeb83cda53149cb84f83d751c7cc09777258` |

**Independent archive verification / التحقق المستقل من الأرشيف**

- Downloaded the exact-run workflow artifact and extracted the buyer ZIP.
- Recomputed the inner ZIP SHA-256 locally; it matched the GitHub release asset digest exactly.
- ZIP CRC test returned no corrupt entry.
- Archive contains 889 ZIP entries and 836 regular files.
- `INTEGRATED_SHA256SUMS.txt` contains 834 file records; all 834 hashes matched the extracted archive contents.
- The buyer trust documents inside the ZIP do not contain the .17 tag, .17 source commit, or .17 archive digest.

تم تنزيل Artifact التشغيل الدقيق واستخراج أرشيف العميل. أُعيد حساب SHA-256 محليًا وتطابق مع بصمة أصل GitHub، وفحص CRC لم يجد أي ملف تالف. يحتوي الأرشيف على 889 إدخال ZIP و836 ملفًا عاديًا؛ وجميع سجلات البصمة الـ834 في `INTEGRATED_SHA256SUMS.txt` تطابقت مع الملفات المستخرجة. كما تم التأكد من خلو وثائق ثقة العميل داخله من هوية وبصمة إصدار .17.

## 2. Build and CI scope / البناء وفحوص CI

The exact Secure Release run completed with `conclusion=success`. The executed release checks included source-line authorization, backend regression, forensic language evidence regeneration, PostgreSQL schema parity, migration preflight, security transaction audit, production-readiness source gate, resilience/load gate, recovery gate, buyer installation verification, buyer self-validation, mobile verification, dependency audits, deterministic SBOM generation/verification, evidence-sidecar rebinding, archive creation, provenance attestation, and versioned draft asset upload.

The manually-dispatched-main check and tag-trigger-only check were skipped because this was an isolated branch push; they are not counted as passed.

رُفع التشغيل الدقيق بنتيجة نجاح. شملت الفحوص المنفذة اعتماد خط المصدر المعزول، اختبارات الخلفية، أدلة اللغات، تكافؤ مخطط PostgreSQL، فحص الترحيلات، تدقيق المعاملات الأمنية، جاهزية المصدر، التحمل والاستعادة، تحقق التثبيت والتحقق الذاتي للمشتري، فحوص الموبايل والاعتماديات، إنشاء SBOM والتحقق منه، فحوص sidecars، بناء الأرشيف، إثبات المنشأ ورفع أصول الإصدار المسودة. فحوص التشغيل اليدوي على main وفحص الوسم الخاص بتشغيل tag لم تُنفذ في هذا المسار، ولا تُحسب نجاحًا.

## 3. Isolation and release publication / العزل وحالة النشر

At final verification:

- The .18 release branch and .18 tag both resolved to `463163dd68aa76e43985a0ba872ccf88d16a0488`.
- `main` remained at `e5a8ee187d54e5fdba05eaacc3bbd8269cbd9062`.
- The .17 annotated tag object remained `cc25977e02684d13b59aa55db1710bfeeb17f293`.
- GitHub Release `450480423` remained `draft=true`, `prerelease=true`, `published_at=null`.
- The new versioned ZIP, external statement and SHA-256 sidecar are the authoritative .18 asset set. Earlier unversioned .18 assets remain on the release for history and are marked superseded in the release notes.

عند التحقق النهائي كان الفرع والوسم .18 على الالتزام نفسه. لم يتغير `main`، ولم يتغير وسم .17. ظلت صفحة GitHub Release مسودة وPre-release وغير منشورة. الأصول الثلاثة المسماة ببصمة الالتزام والتشغيل هي المجموعة المعتمدة؛ أما الأصول القديمة غير المرقمة فاحتُفظ بها كسجل تاريخي وموسومة بأنها مستبدلة.

## 4. Security and Production limitations / حدود الأمن والإنتاج

### 4.1 OPSC_APP_SECURITY — NOT VERIFIED

The exact name `OPSC_APP_SECURITY` was not found as a defined source/package gate or as a Vercel project environment-variable name in the reviewed inventory. GitHub Actions secret names were not inspectable. No PASS result has been fabricated.

Disposition: [OPSC_APP_SECURITY evidence disposition](https://github.com/mosamiryamany-hub/opscore-platform/blob/463163dd68aa76e43985a0ba872ccf88d16a0488/docs/security/OPSC_APP_SECURITY_DISPOSITION.md).

بوابة `OPSC_APP_SECURITY` لم تُعرّف ولم يُعثر على معيار تشغيل قابل للفحص لها في المصدر أو أسماء متغيرات Vercel التي تمت مراجعتها. أسماء GitHub Actions Secrets لم تكن متاحة للفحص. لذلك حالتها **غير متحقق منها** وليست PASS.

### 4.2 Tenant isolation — not Production-certified

Signed tenant-context implementation and verifier migrations exist in the source. They cover a limited, explicitly gated Preview route slice; they do not certify every API route or all PostgreSQL access paths.

The exact source audit dated 2026-11-16 says the 67-route Production signed-context audit is **NOT VERIFIED** and must not generate/publish Production coverage evidence. It distinguishes source allowlists from executed route tests, and explicitly says the available Preview and isolated CI evidence cannot be relabeled as Production certification. The dated source-path audit also documents legacy unsigned GUC paths and separate database access paths requiring further integration.

Evidence:
- [Signed tenant-context route audit (2026-11-16)](https://github.com/mosamiryamany-hub/opscore-platform/blob/463163dd68aa76e43985a0ba872ccf88d16a0488/backend/docs/verification/SIGNED_TENANT_CONTEXT_ROUTE_AUDIT_2026-11-16.md)
- [PostgreSQL tenant-context source-path audit (2026-11-14)](https://github.com/mosamiryamany-hub/opscore-platform/blob/463163dd68aa76e43985a0ba872ccf88d16a0488/backend/docs/verification/POSTGRES_TENANT_CONTEXT_SOURCE_PATH_AUDIT_2026-11-14.md)
- [Tenant-context Node/worker integration plan](https://github.com/mosamiryamany-hub/opscore-platform/blob/463163dd68aa76e43985a0ba872ccf88d16a0488/backend/docs/security/TENANT_CONTEXT_NODE_WORKER_INTEGRATION_PLAN_2026-11-14.md)

**No Production-wide tenant-isolation certification is issued by this release.**

توجد بالفعل شيفرة signed tenant-context وترحيلات verifier، لكنها تغطي شريحة محدودة ومقيّدة بمفاتيح Preview. لا تثبت سلامة كل مسارات API ولا كل مسارات اتصال PostgreSQL. تقرير 16 نوفمبر يصنف اعتماد المسارات الـ67 في Production بأنه **NOT VERIFIED** ويحظر إنشاء أو نشر إثبات تغطية إنتاجي اعتمادًا على مقارنة المصدر أو نتائج Preview. لا توجد شهادة عزل مستأجرين شاملة للإنتاج صادرة عن هذا الإصدار.

### 4.3 Dependency advisory — known exception, not a fix

The included mobile dependency audit allows a documented build-toolchain exception for `GHSA-fc5q-39xc-vjpf` / `CVE-2026-112366`. The advisory currently identifies picomatch through version 4.0.7 as affected and rates it High (CVSS v4 8.7); a patched version is not listed by the advisory. The package's zero-finding npm audit summary reflects this exception and must not be described as proof that upstream code is fixed.  
Source: [GitHub Advisory Database](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).

يتضمن فحص اعتماديات الموبايل استثناءً موثقًا في أدوات البناء للثغرة `GHSA-fc5q-39xc-vjpf` / `CVE-2026-112366`. قاعدة GitHub الأمنية تصنفها High بدرجة CVSS v4 8.7، وتذكر أن picomatch حتى 4.0.7 متأثر، ولا تسجل إصدارًا مصححًا. نتيجة npm audit الخالية من النتائج تعكس الاستثناء ولا تعني إصلاح الكود الأصلي. [مرجع GitHub الأمني](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).

### 4.4 Other buyer/environment residuals / متبقيات بيئة المشتري

- Signed Android AAB / iOS IPA, physical-device QA, app-store review and publication are not evidenced in this source package.
- Native-speaker translation review remains 0/114; production-qualified languages remain 0/114. Machine-assisted translations are not native-speaker approved.
- Licensed maps/routing, external identity, messaging, telephony/call-center, payments, webhooks, storage, KMS/HSM and cloud-provider credentials/contracts remain environment-specific.
- Buyer-specific deployment, migrations, live recovery acceptance, security acceptance and operational certification require their own scope and evidence.

- لا توجد أدلة ضمن هذه الحزمة على ملفات Android AAB أو iOS IPA موقعة، أو اختبار أجهزة فعلية، أو اعتماد ونشر المتاجر.
- مراجعة المتحدثين الأصليين ما زالت 0/114، واللغات المؤهلة للإنتاج 0/114. الترجمات الآلية ليست مراجعة لغوية بشرية.
- خرائط ومسارات مرخصة، ومزودو الهوية والمراسلة والاتصالات ومراكز الاتصال والمدفوعات والويب هوكس والتخزين وKMS/HSM والسحابة، كلها مرتبطة بعقود وبيانات اعتماد بيئة المشتري.
- نشر المشتري وترحيل بياناته واختبارات الاستعادة والأمن والاعتماد التشغيلي تتطلب أدلتها ونطاقها المستقل.

## 5. Commercial and licensing status / الحالة التجارية والترخيص

The exact external commercial statement records:

- `commercialClosure: PASS_WITH_BUYER_RESIDUALS`
- `licenseGrant: NONE_PENDING_RIGHTS_HOLDER_DECISION`
- `distributionAuthorized: false`
- `productionCertification: false`

This means the seller-side source-package build and integrity gates passed with the disclosed residuals. It does **not** mean a buyer has been granted rights or that the hosted Production environment is certified.

Product demonstration and conditional commercial negotiations may proceed using this trust record. No source ZIP delivery for licensed use, installation, modification, resale, redistribution or sublicensing is authorized until the rights holder and named buyer execute a signed License Schedule identifying this exact archive SHA-256 and the specific rights granted.

تثبت هذه الحالة اجتياز بناء حزمة المصدر وفحوص سلامتها من جانب البائع مع الإفصاح عن المتبقيات. لكنها لا تمنح أي مشترٍ حقوقًا، ولا تعني اعتماد بيئة الإنتاج المستضافة.

يمكن عرض المنتج وبدء التفاوض التجاري المشروط باستخدام سجل الثقة هذا. لا يُصرح بتسليم ZIP للاستخدام المرخص أو التثبيت أو التعديل أو إعادة البيع أو التوزيع أو الترخيص من الباطن قبل توقيع صاحب الحقوق والمشتري المحدد على جدول ترخيص يذكر بصمة الأرشيف هذه والحقوق الممنوحة بالتحديد.

## 6. Independent verification links / روابط التحقق

- [Exact source commit](https://github.com/mosamiryamany-hub/opscore-platform/commit/463163dd68aa76e43985a0ba872ccf88d16a0488)
- [Secure Release run #44390787189](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44390787189)
- [Repository](https://github.com/mosamiryamany-hub/opscore-platform)
- [GitHub Release draft record #450480423](https://github.com/mosamiryamany-hub/opscore-platform/releases/450480423)
- [No-license notice](https://github.com/mosamiryamany-hub/opscore-platform/blob/main/NO_LICENSE_GRANT_NOTICE.txt)

**Archive SHA-256 to compare independently:**  
`1f150c26d53464555af633e00e100a64d80db2e58b89dc43a6818eef450c45b1`

**Final disposition / الخلاصة:**  
**Seller source-package: CLOSED — PASS_WITH_BUYER_RESIDUALS.**  
**Buyer license/distribution: NOT GRANTED.**  
**Production security/tenant-isolation certification: NOT ISSUED.**
