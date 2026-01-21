This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Art of Problem Solving Mentor Chat

The Art of Problem Solving practice workspace now includes a guided mentor chat that pairs students with the **Hypothesis Mentor** assistant. When a user opens a mentor-style exercise, the UI renders the new `PracticeMentorChat` component. It shows the scenario context, tracks the questions the student has already surfaced, and streams AI responses from the `/v1/sections/exercises/{exerciseId}/questions/{questionId}/chat` backend endpoints.

- `PracticeMentorChat` lives in `src/components/practice-mentor-chat.tsx` and expects the parent to provide question metadata, an `onLoadSession` callback, and `onSendMessage` for posting student replies.
- `subject-learning-interface.tsx` decides whether to mount `PracticeMentorChat` by checking `getExerciseTypeBySubject`. For Art of Problem Solving subjects the component requests the existing chat session and forwards new messages through the API proxy.
- Mentor chat state is cached per question so students can move between questions without losing progress. The chat automatically disables input after the mentor delivers the final summary turn.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
