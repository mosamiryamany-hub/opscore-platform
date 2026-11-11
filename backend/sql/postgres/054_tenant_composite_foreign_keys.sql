-- 054: Enforce same-tenant parent references with composite foreign keys.
--
-- A tenant-scoped RLS policy on a child row does not prove that the referenced
-- parent row belongs to the same organization. This migration upgrades every
-- single-column FK whose source and target tables both carry organization_id:
--   (child_fk, organization_id) -> (parent.id, parent.organization_id)
--
-- It preserves delete/update actions, MATCH semantics, and deferrability.
-- For ON DELETE SET NULL / SET DEFAULT only the nullable FK column is changed;
-- organization_id is deliberately retained. New FKs are validated before the
-- old constraints are dropped, so there is no integrity gap during migration.
--
-- Unsupported or ambiguous catalog shapes fail closed. No row is rewritten.

DO $migration$
DECLARE
  target_schema text := current_schema();
  fk record;
  source_org record;
  target_org record;
  source_fk record;
  target_id record;
  target_unique_exists boolean;
  source_index_exists boolean;
  target_index_name text;
  source_index_name text;
  temporary_constraint_name text;
  delete_clause text;
  update_clause text;
  match_clause text;
  deferrability_clause text;
  transformed_count integer := 0;
  already_composite_count integer := 0;
  residual_count integer := 0;
BEGIN
  IF target_schema IS NULL THEN
    RAISE EXCEPTION 'TENANT_FK_SCHEMA_UNRESOLVED';
  END IF;

  FOR fk IN
    SELECT
      c.oid AS constraint_oid,
      c.conname,
      c.conrelid,
      c.confrelid,
      c.conkey,
      c.confkey,
      c.confdeltype,
      c.confupdtype,
      c.confmatchtype,
      c.condeferrable,
      c.condeferred,
      c.convalidated,
      source_table.relname AS source_table,
      target_table.relname AS target_table
    FROM pg_constraint AS c
    JOIN pg_class AS source_table ON source_table.oid = c.conrelid
    JOIN pg_namespace AS source_ns ON source_ns.oid = source_table.relnamespace
    JOIN pg_class AS target_table ON target_table.oid = c.confrelid
    JOIN pg_namespace AS target_ns ON target_ns.oid = target_table.relnamespace
    WHERE c.contype = 'f'
      AND source_ns.nspname = target_schema
      AND target_ns.nspname = target_schema
      AND EXISTS (
        SELECT 1 FROM pg_attribute AS a
        WHERE a.attrelid = c.conrelid
          AND a.attname = 'organization_id'
          AND NOT a.attisdropped
      )
      AND EXISTS (
        SELECT 1 FROM pg_attribute AS a
        WHERE a.attrelid = c.confrelid
          AND a.attname = 'organization_id'
          AND NOT a.attisdropped
      )
    ORDER BY source_table.relname, c.conname
  LOOP
    SELECT a.attnum, a.attname, a.atttypid, a.attnotnull
      INTO source_org
    FROM pg_attribute AS a
    WHERE a.attrelid = fk.conrelid
      AND a.attname = 'organization_id'
      AND NOT a.attisdropped;

    SELECT a.attnum, a.attname, a.atttypid, a.attnotnull
      INTO target_org
    FROM pg_attribute AS a
    WHERE a.attrelid = fk.confrelid
      AND a.attname = 'organization_id'
      AND NOT a.attisdropped;

    IF source_org.attnum IS NULL OR target_org.attnum IS NULL THEN
      RAISE EXCEPTION 'TENANT_FK_ORGANIZATION_KEY_MISSING:%', fk.conname;
    END IF;
    IF NOT source_org.attnotnull OR NOT target_org.attnotnull THEN
      RAISE EXCEPTION 'TENANT_FK_ORGANIZATION_KEY_NULLABLE:%', fk.conname;
    END IF;
    IF source_org.atttypid <> target_org.atttypid THEN
      RAISE EXCEPTION 'TENANT_FK_ORGANIZATION_TYPE_MISMATCH:%', fk.conname;
    END IF;

    -- Re-running the migration is safe only for the exact normalized key order.
    IF array_length(fk.conkey, 1) = 2 AND array_length(fk.confkey, 1) = 2 THEN
      SELECT a.attnum, a.attname, a.atttypid, a.attnotnull
        INTO source_fk
      FROM pg_attribute AS a
      WHERE a.attrelid = fk.conrelid
        AND a.attnum = fk.conkey[1]
        AND NOT a.attisdropped;

      SELECT a.attnum, a.attname, a.atttypid
        INTO target_id
      FROM pg_attribute AS a
      WHERE a.attrelid = fk.confrelid
        AND a.attnum = fk.confkey[1]
        AND NOT a.attisdropped;

      IF source_fk.attname IS NULL OR target_id.attname IS NULL
         OR source_fk.attname = 'organization_id'
         OR fk.conkey[2] <> source_org.attnum
         OR target_id.attname <> 'id'
         OR fk.confkey[2] <> target_org.attnum THEN
        RAISE EXCEPTION 'TENANT_FK_COMPOSITE_SHAPE_UNSUPPORTED:%', fk.conname;
      END IF;
      IF NOT fk.convalidated THEN
        RAISE EXCEPTION 'TENANT_FK_COMPOSITE_NOT_VALIDATED:%', fk.conname;
      END IF;

      already_composite_count := already_composite_count + 1;
      CONTINUE;
    END IF;

    IF array_length(fk.conkey, 1) <> 1 OR array_length(fk.confkey, 1) <> 1 THEN
      RAISE EXCEPTION 'TENANT_FK_ARITY_UNSUPPORTED:%', fk.conname;
    END IF;

    SELECT a.attnum, a.attname, a.atttypid, a.attnotnull
      INTO source_fk
    FROM pg_attribute AS a
    WHERE a.attrelid = fk.conrelid
      AND a.attnum = fk.conkey[1]
      AND NOT a.attisdropped;

    SELECT a.attnum, a.attname, a.atttypid, a.attnotnull
      INTO target_id
    FROM pg_attribute AS a
    WHERE a.attrelid = fk.confrelid
      AND a.attnum = fk.confkey[1]
      AND NOT a.attisdropped;

    IF source_fk.attname IS NULL OR target_id.attname IS NULL
       OR source_fk.attname = 'organization_id'
       OR target_id.attname <> 'id'
       OR source_fk.atttypid <> target_id.atttypid THEN
      RAISE EXCEPTION 'TENANT_FK_ENDPOINT_SHAPE_UNSUPPORTED:%', fk.conname;
    END IF;

    IF fk.confdeltype NOT IN ('a', 'r', 'c', 'n', 'd') THEN
      RAISE EXCEPTION 'TENANT_FK_DELETE_ACTION_UNSUPPORTED:%', fk.conname;
    END IF;
    IF fk.confupdtype NOT IN ('a', 'r', 'c') THEN
      -- PostgreSQL does not allow a column subset for ON UPDATE SET NULL/DEFAULT.
      -- Applying those actions to the composite key would clear/change the tenant.
      RAISE EXCEPTION 'TENANT_FK_UPDATE_ACTION_UNSAFE:%', fk.conname;
    END IF;
    IF fk.confmatchtype NOT IN ('s', 'f') THEN
      RAISE EXCEPTION 'TENANT_FK_MATCH_ACTION_UNSUPPORTED:%', fk.conname;
    END IF;
    IF fk.confdeltype IN ('n', 'd') AND source_fk.attnotnull THEN
      RAISE EXCEPTION 'TENANT_FK_NULL_ACTION_ON_NOT_NULL_COLUMN:%', fk.conname;
    END IF;

    -- PostgreSQL requires an exact unique key on the referenced column pair.
    SELECT EXISTS (
      SELECT 1
      FROM pg_index AS i
      WHERE i.indrelid = fk.confrelid
        AND i.indisunique
        AND i.indisvalid
        AND i.indisready
        AND i.indpred IS NULL
        AND i.indexprs IS NULL
        AND i.indnkeyatts = 2
        AND i.indkey[0] = target_id.attnum
        AND i.indkey[1] = target_org.attnum
    ) INTO target_unique_exists;

    IF NOT target_unique_exists THEN
      target_index_name := 'opscore_tenant_ref_uq_' ||
        substr(md5(format('%I.%I', target_schema, fk.target_table)), 1, 16);

      IF to_regclass(format('%I.%I', target_schema, target_index_name)) IS NOT NULL THEN
        RAISE EXCEPTION 'TENANT_FK_TARGET_INDEX_NAME_COLLISION:%', target_index_name;
      END IF;

      EXECUTE format(
        'CREATE UNIQUE INDEX %I ON %I.%I (%I, %I)',
        target_index_name,
        target_schema,
        fk.target_table,
        'id',
        'organization_id'
      );
    END IF;

    -- Add a tenant-first child index only when no valid index already covers
    -- both equality predicates. This supports FK checks and tenant-scoped joins.
    SELECT EXISTS (
      SELECT 1
      FROM pg_index AS i
      WHERE i.indrelid = fk.conrelid
        AND i.indisvalid
        AND i.indisready
        AND i.indpred IS NULL
        AND i.indexprs IS NULL
        AND i.indnkeyatts >= 2
        AND (
          (i.indkey[0] = source_fk.attnum AND i.indkey[1] = source_org.attnum)
          OR
          (i.indkey[0] = source_org.attnum AND i.indkey[1] = source_fk.attnum)
        )
    ) INTO source_index_exists;

    IF NOT source_index_exists THEN
      source_index_name := 'opscore_tenant_ref_ix_' ||
        substr(md5(format('%I.%I.%I', target_schema, fk.source_table, source_fk.attname)), 1, 16);

      IF to_regclass(format('%I.%I', target_schema, source_index_name)) IS NOT NULL THEN
        RAISE EXCEPTION 'TENANT_FK_SOURCE_INDEX_NAME_COLLISION:%', source_index_name;
      END IF;

      EXECUTE format(
        'CREATE INDEX %I ON %I.%I (%I, %I)',
        source_index_name,
        target_schema,
        fk.source_table,
        'organization_id',
        source_fk.attname
      );
    END IF;

    -- A one-column MATCH FULL FK and a one-column MATCH SIMPLE FK have
    -- identical NULL behavior. Once organization_id is added, MATCH SIMPLE
    -- is required so a nullable optional FK can remain NULL while tenant_id
    -- stays NOT NULL.
    match_clause := '';

    delete_clause := CASE fk.confdeltype
      WHEN 'a' THEN ''
      WHEN 'r' THEN ' ON DELETE RESTRICT'
      WHEN 'c' THEN ' ON DELETE CASCADE'
      WHEN 'n' THEN format(' ON DELETE SET NULL (%I)', source_fk.attname)
      WHEN 'd' THEN format(' ON DELETE SET DEFAULT (%I)', source_fk.attname)
      ELSE ''
    END;

    update_clause := CASE fk.confupdtype
      WHEN 'a' THEN ''
      WHEN 'r' THEN ' ON UPDATE RESTRICT'
      WHEN 'c' THEN ' ON UPDATE CASCADE'
      ELSE ''
    END;

    deferrability_clause := CASE
      WHEN fk.condeferrable AND fk.condeferred THEN ' DEFERRABLE INITIALLY DEFERRED'
      WHEN fk.condeferrable THEN ' DEFERRABLE INITIALLY IMMEDIATE'
      ELSE ' NOT DEFERRABLE'
    END;

    temporary_constraint_name := 'opscore_tenant_ref_fk_' ||
      substr(md5(format('%I.%I.%I', target_schema, fk.source_table, fk.conname)), 1, 16);

    IF EXISTS (
      SELECT 1
      FROM pg_constraint AS existing
      WHERE existing.conrelid = fk.conrelid
        AND existing.conname = temporary_constraint_name
    ) THEN
      RAISE EXCEPTION 'TENANT_FK_TEMP_CONSTRAINT_NAME_COLLISION:%', temporary_constraint_name;
    END IF;

    -- Install and validate the composite FK before removing the original FK.
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I
       FOREIGN KEY (%I, %I) REFERENCES %I.%I (%I, %I)%s%s%s%s NOT VALID',
      target_schema,
      fk.source_table,
      temporary_constraint_name,
      source_fk.attname,
      'organization_id',
      target_schema,
      fk.target_table,
      'id',
      'organization_id',
      match_clause,
      delete_clause,
      update_clause,
      deferrability_clause
    );

    EXECUTE format(
      'ALTER TABLE %I.%I VALIDATE CONSTRAINT %I',
      target_schema,
      fk.source_table,
      temporary_constraint_name
    );

    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      target_schema,
      fk.source_table,
      fk.conname
    );

    EXECUTE format(
      'ALTER TABLE %I.%I RENAME CONSTRAINT %I TO %I',
      target_schema,
      fk.source_table,
      temporary_constraint_name,
      fk.conname
    );

    transformed_count := transformed_count + 1;
  END LOOP;

  -- Prove that no FK between two tenant-owned tables remains ID-only.
  SELECT count(*)
    INTO residual_count
  FROM pg_constraint AS c
  JOIN pg_class AS source_table ON source_table.oid = c.conrelid
  JOIN pg_namespace AS source_ns ON source_ns.oid = source_table.relnamespace
  JOIN pg_class AS target_table ON target_table.oid = c.confrelid
  JOIN pg_namespace AS target_ns ON target_ns.oid = target_table.relnamespace
  WHERE c.contype = 'f'
    AND source_ns.nspname = target_schema
    AND target_ns.nspname = target_schema
    AND EXISTS (
      SELECT 1 FROM pg_attribute AS a
      WHERE a.attrelid = c.conrelid AND a.attname = 'organization_id' AND NOT a.attisdropped
    )
    AND EXISTS (
      SELECT 1 FROM pg_attribute AS a
      WHERE a.attrelid = c.confrelid AND a.attname = 'organization_id' AND NOT a.attisdropped
    )
    AND NOT (
      c.convalidated
      AND array_length(c.conkey, 1) = 2
      AND array_length(c.confkey, 1) = 2
      AND EXISTS (
        SELECT 1 FROM pg_attribute AS source_fk
        WHERE source_fk.attrelid = c.conrelid
          AND source_fk.attnum = c.conkey[1]
          AND source_fk.attname <> 'organization_id'
          AND NOT source_fk.attisdropped
      )
      AND EXISTS (
        SELECT 1 FROM pg_attribute AS source_org_key
        WHERE source_org_key.attrelid = c.conrelid
          AND source_org_key.attnum = c.conkey[2]
          AND source_org_key.attname = 'organization_id'
          AND NOT source_org_key.attisdropped
      )
      AND EXISTS (
        SELECT 1 FROM pg_attribute AS target_id_key
        WHERE target_id_key.attrelid = c.confrelid
          AND target_id_key.attnum = c.confkey[1]
          AND target_id_key.attname = 'id'
          AND NOT target_id_key.attisdropped
      )
      AND EXISTS (
        SELECT 1 FROM pg_attribute AS target_org_key
        WHERE target_org_key.attrelid = c.confrelid
          AND target_org_key.attnum = c.confkey[2]
          AND target_org_key.attname = 'organization_id'
          AND NOT target_org_key.attisdropped
      )
    );

  IF residual_count <> 0 THEN
    RAISE EXCEPTION 'TENANT_FK_UNPAIRED_REFERENCES_REMAIN:%', residual_count;
  END IF;

  RAISE NOTICE 'TENANT_COMPOSITE_FK_MIGRATION transformed=% already_composite=% residual=%',
    transformed_count, already_composite_count, residual_count;
END
$migration$;
