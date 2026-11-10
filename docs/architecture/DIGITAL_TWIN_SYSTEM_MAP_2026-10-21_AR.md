# الخريطة الهندسية العليا للتوأم الرقمي متعدد المجالات — OpsCore FIELD

**تاريخ المراجعة:** 2026-10-21  
**الحالة:** خريطة هدف هندسي مرتبطة بما هو موجود في الشفرة؛ ليست شهادة تنفيذ أو اعتماد.  
**قاعدة الإثبات:** كل قدرة موسومة `IMPLEMENTED-LOCAL` لها تنفيذ محلي قابل للفحص، و`STATIC-CONTRACT` تعني أن عقدًا أو مخططًا موجود لكن لم يُختبر على بنية حية، و`PLANNED` تعني غير منفذ، و`EXTERNAL-PROOF-REQUIRED` تعني أن إثباتها يعتمد على خدمة/معدات/بيئة خارجية.

## 1. الرؤية: Digital Twin System لا مجرد نسخة حالة

الهدف ليس لوحة مؤشرات أكبر. الهدف هو نظام متعدد المجالات يربط الواقع المرصود بسياقه وتاريخه وقراراته وإجراءات يمكن مراجعتها. الخريطة تتبع أربع طبقات مستوحاة من إطار Digital Twin System Framework المنشور من Digital Twin Consortium في 25 أغسطس 2026: **Data → Context → Decision & Process Orchestration → Actuation**، مع Digital Thread يربط كل شيء عبر دورة الحياة. هذا مرجع تصميم، وليس ادعاء اعتماد أو شراكة.

```text
REAL WORLD / ENTERPRISE SYSTEMS
  Sensors | People | Work Orders | Assets | ERP/CRM | GIS/BIM | Documents
                               |
                               v
[1] DATA PLANE
  authenticated adapters -> schema validation -> deduplication -> event/outbox
  timestamps + units + provenance + quality + consent/classification
                               |
                               v
[2] CONTEXT PLANE
  tenant / entity identity -> ontology mapping -> temporal state
  relationships + geospatial context + reported-vs-observed-vs-desired state
                               |
                               v
[3] DECISION & ORCHESTRATION
  deterministic rules -> scenario simulation -> calibrated models
  uncertainty + evidence lineage + policy checks + human approval
                               |
                               v
[4] ACTUATION PLANE
  approved command -> adapter capability check -> idempotent dispatch
  acknowledgement / timeout / compensation -> outcome evidence
                               |
                               v
DIGITAL THREAD: source event -> normalized fact -> state version -> decision
                -> approval -> command -> acknowledgement -> measured outcome
```

## 2. ما هو موجود اليوم

| المجال | الحالة | الدليل / الحد |
|---|---|---|
| نواة التوأم الحتمية وتطبيع JSON | `IMPLEMENTED-LOCAL` | `backend/src/digital-twin-core.js`; لا تستنتج حالة مادية من دون مصدر |
| ملخص تشغيلي متعدد المجالات | `IMPLEMENTED-LOCAL` | `backend/src/platform-intelligence-layer.js`; أوامر العمل، الأصول، المواعيد، الصيانة، الفواتير، التسليمات |
| لقطات محفوظة وسلسلة SHA-256 ذرية | `IMPLEMENTED-LOCAL` | جداول `operational_twin_snapshots` و`operational_twin_chain_events`؛ كشف التلاعب الجزئي لا يمنع مسؤول DB من إعادة كتابة السلسلة كاملة |
| واجهات التاريخ والتحقق | `IMPLEMENTED-LOCAL` | مسارات `/api/v1/platform/twin/...` مع سياق المؤسسة والصلاحيات |
| مخطط PostgreSQL للسلسلة | `STATIC-CONTRACT` | `backend/sql/postgres/031_digital_twin_chain_hardening.sql`؛ فحص التكافؤ الساكن يمر، لكن لا توجد نتيجة تشغيل PostgreSQL حي في هذا المرشح |
| سياق المؤسسة في موصل PostgreSQL | `IMPLEMENTED-LOCAL` | `backend/src/adapters/postgres.js` يضبط `app.tenant_id` الذي تقرؤه السياسات، ويزامن الأسماء القديمة ويمسحها قبل إعادة الاتصال للمسبح؛ يغطيه `postgres_rls_context_contract.test.js` لكن ليس هذا إثبات خادم حي |
| RLS لسلسلة التوأم | `STATIC-CONTRACT` | `backend/db/postgresql_hierarchy_rls.sql` والترحيل 031؛ RLS مفعّل ومجبَر مع سياسة نطاق المؤسسة، لكن يلزم اختبار حي |
| بوابة RLS الحية | `IMPLEMENTED-LOCAL / NOT RUN` | `backend/scripts/postgres-live-rls-gate.js` يطبق الترحيل في schema مؤقت ويختبر قراءات/كتابات متعددة المؤسسات بدور `NOSUPERUSER NOBYPASSRLS`؛ نتيجة هذه البيئة `UNVERIFIED` لغياب URL وdriver وخادم |
| تشغيل بوابة RLS على CI | `WORKFLOW-IMPLEMENTED / NOT EXECUTED` | `.github/workflows/digital-twin-postgres-live.yml` يجهز PostgreSQL 18 ويشغل البوابة عند pull request أو dispatch؛ لم تُشغل GitHub Actions لأن الحزمة ليست مرفوعة إلى مستودع في هذه المهمة |
| توقيع رأس السلسلة بصيغة DSSE + Ed25519 | `IMPLEMENTED-LOCAL / UNIT-TESTED` | `backend/src/digital-twin-seal.js`؛ تطبيع صارم مع رفض البيانات الفقدية وقيود الحجم، توقيع PAE، بصمة مفتاح عام، وحدود ادعاءات لا يسمح verifier بتجاوزها، وتوقيع عبر adapter بعيد؛ تحقق من envelope عبر `backend/scripts/verify-digital-twin-seal.js` |
| نشر الختم في مخزن مستقل غير قابل للتعديل | `CONTRACT-ONLY` | واجهة `publishDigitalTwinSeal` تتطلب receipt يعلن retention immutability وHTTPS، لكنها لا تتصل بمزوّد ولا تتحقق مستقلًا من صحة ادعاء المزود |
| محاكاة السعة | `IMPLEMENTED-LOCAL / LIMITED` | نموذج حسابي حتمي في `simulatePlatformScenario`; ليس محاكاة فيزيائية ولا تنبؤًا مُعايرًا |
| مصدر قياسات مادية/IoT/SCADA | `PLANNED` | لا يوجد مزود متصل مثبت أو بيانات أجهزة موثقة |
| رسم ثلاثي الأبعاد / BIM / توأم هندسي فيزيائي | `PLANNED` | لا توجد هندسة/mesh أو معايرة مقابل واقع مادي |
| تنبؤ أعطال وتقدير عدم اليقين | `PLANNED` | لا توجد مجموعة بيانات تقييم أو معايرة تنبؤ مثبتة |
| KMS/HSM / transparency log / object-lock موصول | `PLANNED` | توجد حدود توقيع وتوصيل publisher فقط؛ لا يوجد KMS/HSM أو ختم زمني أو مخزن immutable متصل |
| PostgreSQL RLS حي وتزامن متعدد المؤسسات | `EXTERNAL-PROOF-REQUIRED` | يحتاج قاعدة PostgreSQL فعلية وأدوار runtime/migrator واختبارات منافسة |

## 3. معايير التقنية المستهدفة — الاختيار بحسب الحاجة لا الموضة

### 3.1 التبادل والتكامل

- **W3C Web of Things (WoT) Thing Description 1.1** كعقد وصف موحد للخصائص والأفعال والأحداث عندما تظهر أجهزة أو خدمات حقيقية؛ لا تُستخدم مسودة WoT 2.0 كشرط إنتاجي قبل استقرارها.
- **MQTT 5 / HTTP / AMQP / Kafka** عبر محولات مستقلة عند وجود أنظمة فعلية تدعمها؛ لا نضيف broker لمجرد وجوده في قائمة التقنيات.
- تقييم **Eclipse Ditto** كوسيط توأم للأجهزة إذا أصبح نطاق المشروع إدارة آلاف الأجهزة وحالات reported/desired/live والاتصال بها. لا يُدمج بديلًا عن منطق OpsCore قبل مقارنة التكرار والكلفة وحدود الملكية.
- استخدام **CloudEvents** لتوحيد غلاف الأحداث عند بناء حدود تكامل عامة، مع versioning وeventId وsource وsubject وtime وcontent type وtenant binding واضح.

### 3.2 البيانات والزمن والجغرافيا

- PostgreSQL كمرشح التخزين المؤسسي الأساسي، وPostGIS فقط عند تفعيل ميزات مكانية واختبارها؛ SQLite تظل مفيدة للتطوير/الاختبارات المحلية وليست برهانًا على RLS في PostgreSQL.
- إضافة **bitemporal semantics** عند الحاجة: `valid_time` لما يقال إن الحقيقة كانت صحيحة فيه، و`recorded_time` لوقت تسجيل النظام لها. لا تُستبدل سجلات قديمة بصمت؛ تُحفظ التصحيحات كأحداث جديدة.
- فصل `reported_state` عن `desired_state` و`observed_state`، مع مصدر كل قيمة وعمرها ووحدتها وجودتها وثقتها؛ لا تدمج هذه الحالات في حقل واحد.
- بناء رسم علاقات/Graph فقط بعد تحديد استعلامات ملموسة (dependency impact, asset-to-site, work-order-to-evidence) وإثبات أن PostgreSQL relational/recursive queries لا تكفي. لا تُضف graph database افتراضيًا.

### 3.3 الرصد والاعتمادية

- اعتماد **OpenTelemetry** للتتبعات والمقاييس والسجلات عند توصيل SDKs فعلية، مع semantic conventions وإخفاء PII/الأسرار. لا تسجل محتوى حساسًا في spans.
- ربط كل command بـ correlation/causation IDs وidempotency key وoutbox delivery state وacknowledgement؛ retries محدودة ومصنفة، لا إعادة تنفيذ عمياء لأفعال غير idempotent.
- مؤشرات خدمة مستهدفة: freshness lag، نسبة telemetry المرفوضة، twin snapshot duration، chain verification failures، outbox age، action acknowledgement latency، وtenant-denial count. لا تُعلن SLO قبل جمع بيانات أساس حقيقية.

### 3.4 المحاكاة والذكاء الاصطناعي

- ترتيب النضج: deterministic baseline → replay من أحداث تاريخية → simulator محدود النطاق → معايرة مقابل نتائج حقيقية → shadow evaluation → توصية بموافقة بشرية → تحكم محدود قابل للتراجع.
- كل نموذج يجب أن يحمل dataset/version، features، training/evaluation window، calibration report، drift monitor، uncertainty، rollback path، وmodel card. غيابها يعني `UNQUALIFIED` لا `PREDICTIVE`.
- LLM/agent لا يكتب مباشرة إلى أنظمة مادية. يقرأ سياقًا مصرحًا، يقترح خطة، يتحقق policy engine من الصلاحيات والحدود، يطلب موافقة بشرية عند التأثير المادي/المالي/السلامة، ثم يرسل adapter أمرًا ذا صلاحية ضيقة.
- لا تُستخدم نتائج محاكاة أو LLM كدليل ميداني أو كقياس جهاز. الفصل بين observation وinference وrecommendation وcommand إلزامي.

### 3.5 الأمان وسلامة الإثبات

- RLS لكل جدول tenant-scoped، `FORCE ROW LEVEL SECURITY`، runtime role غير مالك الجداول وغير BYPASSRLS، وسياق tenant مضبوط داخل المعاملة؛ اختبار سلبي يثبت أن غياب السياق يرفض الوصول.
- فصل دور الترحيل عن runtime، أقل صلاحية، أسرار خارج المستودع، rotation، ونسخ احتياطية مشفرة مع استعادة مجربة.
- تحويل سلسلة التجزئة إلى ختم خارجي فقط عند توفير مفتاح خارج قاعدة البيانات (KMS/HSM) أو خدمة ختم مستقلة؛ توقيع الرأس الدوري يتضمن tenant scope وsequence/head hash وschema version وtimestamp ومفتاح key ID. تدوير المفتاح والتحقق التاريخي جزء من التصميم.
- التوقيع أو hash chain لا يمنع حذف البيانات وحده، ولا يثبت صحة البيانات الداخلة؛ مصدر موثوق ومصادقة الجهاز وجودة القياس تبقى مطلوبة.

## 4. خريطة تنفيذ مرحلية ببوابات قبول

### المرحلة A — تكافؤ المخطط والعزل (العقد موجودة؛ الإثبات الحي معلّق)

1. الحفاظ على ترحيل `031_digital_twin_chain_hardening.sql` وتعريف الجدول في schema الأساسي وRLS.
2. فحص التكافؤ يقارن جميع جداول SQLite مع schema PostgreSQL ومع مجموعة المهاجرات، ويكشف نقص RLS لجدول السلسلة.
3. جرى إصلاح mismatch في موصل PostgreSQL: كان الموصل يضبط `app.current_tenant_id` و`app.organization_id` بينما سياسات RLS تقرأ `app.tenant_id`. الاختبارات المحلية تثبت توحيد السياق والتنظيف عند إعادة الاتصال للمسبح.
4. بوابة حية مضافة عبر `npm run db:postgres-live-rls`؛ النتيجة الحالية `UNVERIFIED` لأن هذه البيئة لا تتوفر فيها قاعدة اختبار/driver/خدمة PostgreSQL. لا تتحول الحالة إلى `PASS` بمجرد وجود السكربت.
5. على PostgreSQL مستهدف، تطبيق كل المهاجرات من قاعدة فارغة وترقية نسخة قائمة، ثم اختبارات runtime/migrator منفصلة، وtenant A/B في القراءة/الإدراج/التحديث/الحذف، والسياق الغائب، ومالك الجدول/`BYPASSRLS`، والتزامن على sequence. أي تسرب = release blocker.

**بوابة الخروج:** `PASS` لا يصدر إلا إذا نجحت كل الاختبارات الحية وسُجلت نسخة PostgreSQL وصورة/إعداد البيئة ونتيجة CI.

### المرحلة B — توقيع DSSE ثم تثبيت خارجي مستقل

1. **موجود الآن:** `digital-twin-seal.js` يبني غلاف DSSE بــ PAE؛ يوقّع الرأس بـ Ed25519 محليًا أو عبر callback لموقّع بعيد، ويتحقق محليًا من صحة توقيع الموصل البعيد قبل إخراج envelope.
2. يحمل payload المؤسسة، وتسلسل/بصمة الرأس، وعدد الأحداث واللقطات، ووقت الإصدار، وkey ID، وبصمة المفتاح العام، وhash الختم السابق الاختياري. ويرفض السلسلة غير الصالحة أو العدادات غير المتسقة.
3. **موجود الآن:** verifier CLI يتحقق من الملف المنفصل بواسطة المفتاح العام فقط؛ اختبارات الوحدة تتحقق من كشف تعديل payload/signature واستخدام مفتاح خاطئ.
4. **غير موصول:** لا مفتاح KMS/HSM ولا مزود ختم زمني/شفافية/تخزين object-lock. واجهة النشر ترفض عدم وجود adapter أو receipt غير immutable، لكن receipt الذي يعيده مزود افتراضي/موصل غير موصول ليس إثبات نشر حقيقيًا.
5. الاختيار المقترح: KMS/HSM أو خدمة توقيع بعيدة، مع private object-lock store أو transparency service مناسبة للبيانات الخاصة. Sigstore/Rekor مناسبين لتوقيع/إثبات مواد البرمجيات العامة إذا سمحت الخصوصية؛ لا ترفع تفاصيل عمليات العملاء إلى سجل عام بلا مراجعة قانونية/خصوصية.
6. اختبر الانقطاع، التكرار، تدوير المفاتيح، إساءة استخدام key ID، اختلاف الساعة، الاحتفاظ، الاستعادة، وإمكانية التحقق بعد rollback لقاعدة البيانات.

**بوابة الخروج:** التحقق المستقل من رأس قديم ببايتاته وتوقيعه وإيصال خارج نطاق قاعدة التطبيق، مع سياسة retention موثقة ومختبرة. لا تُعتبر المرحلة مكتملة قبل توصيل المزود والقيام باختبار حي.

### المرحلة C — digital thread والبيانات الفيزيائية

1. تعريف سجل مصادر وموصلات مع manifests وصلاحيات capabilities وschema contracts.
2. إضافة W3C WoT descriptions/CloudEvents عند وجود أجهزة أو أنظمة تكامل محددة.
3. بناء ingestion: auth → validation → timestamp/units → dedupe → quarantine → provenance → outbox.
4. إدخال reported/observed/desired state مع freshness/quality/uncertainty لكل قيمة.
5. اختبار فقد الشبكة، الرسائل المكررة والمتأخرة، الساعات المنحرفة، تبديل الأجهزة، وإعادة التشغيل.

### المرحلة D — محاكاة ومعايرة

1. تحديد مجال واحد أولًا وقرار تشغيلي واحد قابل للقياس.
2. جمع بيانات تاريخية مأذون بها مع labels وقياس انحيازها وفقدها.
3. بناء baseline حتمي ومقارنته بنتيجة النموذج؛ فصل training عن test زمنيًا.
4. اختبار calibration، precision/recall أو خطأ التنبؤ الملائم، drift، وحالات الفشل خارج التوزيع.
5. تشغيل shadow mode ثم توصيات فقط؛ لا يوجد actuation آلي قبل بوابة السلامة وموافقة بشرية موثقة.

### المرحلة E — التوسع والتحكم

- محاكاة أحداث/أحمال وتنافس متزامن، partitioning/retention، إعادة تشغيل تاريخية، وخطة DR.
- command adapters بقدرات مصرح بها، timeout/acknowledgement، idempotency، compensation، circuit breaker، وسجل نتائج.
- استقلال النطاقات: facility/energy/logistics/industrial/telecom/healthcare وغيرها عبر نماذج مجال منفصلة لا افتراضات مضمنة في النواة.

## 5. تعريف “العملاق” القابل للإثبات

لا يقاس الحجم بعدد المزايا أو التقنيات في `package.json`. يقاس بقدرة النظام على:

1. تفسير مصدر كل حقيقة وعمرها وجودتها.
2. إعادة إنتاج قرار من snapshot/rules/model versions.
3. اكتشاف فقد/تعديل/تكرار الأحداث، مع بيان حد الضمان الأمني.
4. إثبات عزل المؤسسة على محرك قاعدة البيانات الفعلي.
5. مقارنة المحاكاة بالواقع مع قياس خطأ وعدم يقين.
6. منع الوكيل من الفعل خارج الصلاحية أو بلا موافقة مطلوبة.
7. التراجع والتعافي دون تكرار أو فقد أو ادعاء نجاح غير مثبت.

## 6. مراجع معيارية للتحقق عند التنفيذ

- Digital Twin Consortium — Digital Twin System Framework (إعلان 25 أغسطس 2026): https://www.digitaltwinconsortium.org/press-room/digital-twin-consortium-announces-the-digital-twin-system-framework/
- Digital Twin Consortium — System Interoperability Framework: https://www.digitaltwinconsortium.org/digital-twin-system-interoperability-framework-form/
- W3C Web of Things documentation (تمييز Recommendations عن Working Drafts): https://www.w3.org/WoT/documentation/
- Eclipse Ditto — Digital Twin/Connectivity concepts: https://eclipse.dev/ditto/
- OpenTelemetry Semantic Conventions (الإصدار المعروض 1.44.0 عند المراجعة): https://opentelemetry.io/docs/specs/semconv/
- PostgreSQL 18 — Row Security Policies (تحذير تجاوز RLS بواسطة superuser/BYPASSRLS، وFORCE بالنسبة للمالك): https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- DSSE specification — envelope وPre-Authentication Encoding: https://github.com/secure-systems-lab/dsse
- Sigstore — التوقيع والتوثيق وسجل الشفافية؛ يلزم تقييم الخصوصية قبل استخدام السجل العام: https://docs.sigstore.dev/cosign/signing/overview/

**قاعدة نهائية:** المرجع العالمي يوجّه التصميم؛ لا يثبت أن OpsCore يطبق التقنية. أي ادعاء تنفيذ يجب أن يرتبط بملف، واختبار، ونتيجة، وبيئة تشغيل محددة.

## آخر نتيجة تحقق في 21 أكتوبر 2026

- مجموعة الإصدار المكتملة: **392/392 اختبارًا عبر 96 ملف اختبار؛ PASS** على Node 22.16.0، بعد آخر تغييرات ملف الختم.
- فحوص تكافؤ PostgreSQL: **127/127/127 PASS**؛ و29 ملف ترحيل في الفحص المسبق. هذه نتائج ساكنة.
- SBOM CycloneDX 1.6: **476 مكونًا؛ PASS للتحقق البنيوي مقابل ملفات القفل**.
- PostgreSQL/RLS الحي: **UNVERIFIED**؛ لم يُتصل بخادم في بيئة التنفيذ الحالية.
- KMS/HSM/مخزن immutable/شفافية خارجية: **غير موصول**.
