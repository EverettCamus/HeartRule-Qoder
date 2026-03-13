---
document_id: openspec-templates-scrum-spec-change-md
authority: primary
status: active
version: 1.0.0
last_updated: 2026-03-12
source: openspec
path: templates/scrum-spec-change.md
tags: [authoritative, current, specification]
search_priority: high
---

# Change: {{change_id}} - {{title}}

## Sprint Information

**Sprint Number**: {{sprint_number}}  
**Sprint Dates**: {{sprint_dates}}  
**Scrum Team**: {{scrum_team}}  
**Product Owner**: {{product_owner}}  
**Scrum Master**: {{scrum_master}}  
**Status**: {{status}}  
**Priority**: {{priority}}

## Sprint Goals

{{sprint_goals}}

## Capacity & Focus

**Team Capacity**: {{capacity}} story points  
**Focus Areas**: {{focus_areas}}

## User Stories

{{user_stories}}

### Story Details

{{#each stories}}

#### {{this.id}}: {{this.title}}

**Description**: {{this.description}}  
**Story Points**: {{this.story_points}}  
**Priority**: {{this.priority}}

**Acceptance Criteria**:
{{this.acceptance_criteria}}

**Definition of Done**:
{{this.definition_of_done}}
{{/each}}

## Implementation Plan

### Tasks

{{tasks}}

### Dependencies

{{dependencies}}

### Risks & Mitigation

{{risks_mitigation}}

## Review & Verification

### Demo Notes

{{demo_notes}}

### Feedback Received

{{feedback}}

### Metrics

{{metrics}}

### Improvements Identified

{{improvements}}

## Retrospective

### What Went Well

{{what_went_well}}

### What Could Improve

{{what_could_improve}}

### Action Items

{{action_items}}

## Evidence

{{evidence}}

## Notes

{{notes}}
