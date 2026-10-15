# Marketplace MVP

## Goal
Create a responsive Web/PWA marketplace for renovation and construction services with a NestJS backend.

## Initial scope
- Customer and contractor roles
- Contractor profiles and portfolios
- Job listings and bids
- Deal lifecycle (without custodying money)
- Messaging and attachments
- Admin moderation

## Architecture plan
- Monorepo: apps/web (Next.js), apps/api (NestJS), packages/shared
- PostgreSQL for core transactional data
- Object storage for media; Redis for queues as needed
- External licensed payment partner for safe-deal flows in a later milestone

## Safety gate
Do not launch money movement without provider approval, idempotency controls, role authorization tests, and independent review.
