# Weaver Glossary

## Thread

A meaningful work artifact: requirement, project, task, decision, agent session, code change, pull request, or test evidence.

## Fabric

The connected context formed by threads across the company’s repositories and collaboration tools.

## Weave

The act of creating, validating, and maintaining links between threads.

## Requirement

The unit that work is delivered against: the problem, the outcome, its owner and status, and the tasks that deliver it. Where its intent and acceptance criteria live is decided by the operating guideline: in the requirement itself, or in the intents it names ([DEC-025](../decisions/DEC-025-minimal-model-of-a-development-policy.md)).

## Task

An executable unit of work derived from a requirement.

## Operating guideline

An organization's way of going from intent to code: its levels, their names, its checks, and its tools. Weaver follows the guideline that applies to a repository without knowing it by name ([DEC-019](../decisions/DEC-019-operating-guidelines-by-reference.md)).

## Intent

The unit of product intent that a requirement serves, such as a user story or a Promise. Weaver knows it only as an ID in `story_ids`, whose form the process file may set.

## Acceptance criterion

A verifiable condition under an intent or a requirement. Weaver knows it only as an ID in a task's `criteria`, whose form the process file may set.

## Evidence

An observable artifact proving work happened or was verified: agent session, branch, commit, pull request, CI result, review, or release record.

## Human decision

A decision that must be made or approved by a person before the work can proceed or be accepted.

## Agent

An AI participant that can be assigned work, produce artifacts, report progress, and request human input.
