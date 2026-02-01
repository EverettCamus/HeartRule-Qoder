import { pgTable, uuid, varchar, text, timestamp, jsonb, index, pgEnum } from 'drizzle-orm/pg-core';

/**
 * 数据库Schema定义
 * 使用Drizzle ORM for PostgreSQL 16
 */

// 枚举定义
export const sessionStatusEnum = pgEnum('session_status', [
  'active',
  'paused',
  'completed',
  'failed',
]);
export const executionStatusEnum = pgEnum('execution_status', [
  'running',
  'waiting_input',
  'paused',
  'completed',
  'error',
]);
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system']);
export const scriptTypeEnum = pgEnum('script_type', ['session', 'technique', 'awareness']);
export const scriptStatusEnum = pgEnum('script_status', ['draft', 'published', 'archived']);
export const variableScopeEnum = pgEnum('variable_scope', ['global', 'session', 'phase', 'topic']);
export const projectStatusEnum = pgEnum('project_status', [
  'draft',
  'published',
  'archived',
  'deprecated',
]);
export const fileTypeEnum = pgEnum('file_type', [
  'global',
  'roles',
  'skills',
  'forms',
  'rules',
  'session',
]);
export const validationStatusEnum = pgEnum('validation_status', ['valid', 'invalid', 'unknown']);

/**
 * 会话表
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    scriptId: uuid('script_id').notNull(),
    status: sessionStatusEnum('status').notNull().default('active'),
    executionStatus: executionStatusEnum('execution_status').notNull().default('running'),
    position: jsonb('position')
      .notNull()
      .$type<{ phaseIndex: number; topicIndex: number; actionIndex: number }>(),
    variables: jsonb('variables').notNull().default({}),
    metadata: jsonb('metadata').notNull().default({}),
    // 版本绑定字段
    versionId: uuid('version_id').references(() => projectVersions.id),
    versionSnapshot: jsonb('version_snapshot').$type<Record<string, any>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (table) => {
    return {
      userIdIdx: index('sessions_user_id_idx').on(table.userId),
      statusIdx: index('sessions_status_idx').on(table.status),
      createdAtIdx: index('sessions_created_at_idx').on(table.createdAt),
      versionIdIdx: index('sessions_version_id_idx').on(table.versionId),
    };
  }
);

/**
 * 消息表
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    actionId: varchar('action_id', { length: 255 }),
    metadata: jsonb('metadata').notNull().default({}),
    timestamp: timestamp('timestamp').notNull().defaultNow(),
  },
  (table) => {
    return {
      sessionIdIdx: index('messages_session_id_idx').on(table.sessionId),
      timestampIdx: index('messages_timestamp_idx').on(table.timestamp),
    };
  }
);

/**
 * 脚本表
 */
export const scripts = pgTable(
  'scripts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scriptName: varchar('script_name', { length: 255 }).notNull().unique(),
    scriptType: scriptTypeEnum('script_type').notNull(),
    scriptContent: text('script_content').notNull(),
    parsedContent: jsonb('parsed_content'),
    version: varchar('version', { length: 50 }).notNull().default('1.0.0'),
    status: scriptStatusEnum('status').notNull().default('draft'),
    author: varchar('author', { length: 255 }).notNull(),
    description: text('description').notNull().default(''),
    tags: jsonb('tags').notNull().default([]).$type<string[]>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => {
    return {
      typeStatusIdx: index('scripts_type_status_idx').on(table.scriptType, table.status),
      nameIdx: index('scripts_name_idx').on(table.scriptName),
    };
  }
);

/**
 * 脚本工程表
 */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectName: varchar('project_name', { length: 255 }).notNull(),
    description: text('description').notNull().default(''),
    engineVersion: varchar('engine_version', { length: 50 }).notNull(),
    engineVersionMin: varchar('engine_version_min', { length: 50 }).notNull(),
    currentVersionId: uuid('current_version_id'),
    status: projectStatusEnum('status').notNull().default('draft'),
    author: varchar('author', { length: 255 }).notNull(),
    tags: jsonb('tags').notNull().default([]).$type<string[]>(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => {
    return {
      statusIdx: index('projects_status_idx').on(table.status),
      authorIdx: index('projects_author_idx').on(table.author),
      nameIdx: index('projects_name_idx').on(table.projectName),
    };
  }
);

/**
 * 脚本文件表（隶属于工程）
 */
export const scriptFiles = pgTable(
  'script_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    fileType: fileTypeEnum('file_type').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileContent: jsonb('file_content').notNull(),
    yamlContent: text('yaml_content'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => {
    return {
      projectIdIdx: index('script_files_project_id_idx').on(table.projectId),
      fileTypeIdx: index('script_files_file_type_idx').on(table.fileType),
    };
  }
);

/**
 * 工程草稿表
 */
export const projectDrafts = pgTable('project_drafts', {
  projectId: uuid('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  draftFiles: jsonb('draft_files').notNull().$type<Record<string, any>>(),
  validationStatus: validationStatusEnum('validation_status').notNull().default('unknown'),
  validationErrors: jsonb('validation_errors').default([]).$type<any[]>(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 255 }).notNull(),
});

/**
 * 工程版本表
 */
export const projectVersions = pgTable(
  'project_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    versionNumber: varchar('version_number', { length: 32 }).notNull(),
    versionFiles: jsonb('version_files').notNull().$type<Record<string, any>>(),
    releaseNote: text('release_note').notNull().default(''),
    isRollback: varchar('is_rollback', { length: 10 }).notNull().default('false'),
    rollbackFromVersionId: uuid('rollback_from_version_id'),
    publishedAt: timestamp('published_at').notNull().defaultNow(),
    publishedBy: varchar('published_by', { length: 255 }).notNull(),
  },
  (table) => {
    return {
      projectIdIdx: index('project_versions_project_id_idx').on(table.projectId),
      publishedAtIdx: index('project_versions_published_at_idx').on(table.publishedAt),
    };
  }
);

/**
 * 变量表（快照存储）
 */
export const variables = pgTable(
  'variables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    variableName: varchar('variable_name', { length: 255 }).notNull(),
    value: jsonb('value').notNull(),
    scope: variableScopeEnum('scope').notNull(),
    valueType: varchar('value_type', { length: 50 }).notNull(),
    source: varchar('source', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => {
    return {
      sessionIdIdx: index('variables_session_id_idx').on(table.sessionId),
      nameIdx: index('variables_name_idx').on(table.variableName),
    };
  }
);

/**
 * 记忆表
 */
export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    memoryType: varchar('memory_type', { length: 50 }).notNull(),
    importance: varchar('importance', { length: 10 }).notNull(),
    // embedding: vector('embedding', { dimensions: 1536 }), // 需要pgvector扩展
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    accessedAt: timestamp('accessed_at').notNull().defaultNow(),
    accessCount: varchar('access_count', { length: 10 }).notNull().default('0'),
  },
  (table) => {
    return {
      sessionIdIdx: index('memories_session_id_idx').on(table.sessionId),
      typeIdx: index('memories_type_idx').on(table.memoryType),
      importanceIdx: index('memories_importance_idx').on(table.importance),
    };
  }
);

// 导出类型
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Script = typeof scripts.$inferSelect;
export type NewScript = typeof scripts.$inferInsert;
export type Variable = typeof variables.$inferSelect;
export type NewVariable = typeof variables.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ScriptFile = typeof scriptFiles.$inferSelect;
export type NewScriptFile = typeof scriptFiles.$inferInsert;
export type ProjectDraft = typeof projectDrafts.$inferSelect;
export type NewProjectDraft = typeof projectDrafts.$inferInsert;
export type ProjectVersion = typeof projectVersions.$inferSelect;
export type NewProjectVersion = typeof projectVersions.$inferInsert;
