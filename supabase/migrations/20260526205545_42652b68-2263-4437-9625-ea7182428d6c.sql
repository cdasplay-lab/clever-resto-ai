
-- Phase 2: Human handoff / manual reply
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_bot_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_to uuid;

-- Allow restaurant owner to update their conversations (pause/resume, assign)
DROP POLICY IF EXISTS "owners update own conversations" ON public.conversations;
CREATE POLICY "owners update own conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = conversations.restaurant_id AND r.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = conversations.restaurant_id AND r.owner_id = auth.uid()));

-- Allow owner to insert manual reply messages into their conversations
DROP POLICY IF EXISTS "owners insert own messages" ON public.messages;
CREATE POLICY "owners insert own messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.conversations c
  JOIN public.restaurants r ON r.id = c.restaurant_id
  WHERE c.id = messages.conversation_id AND r.owner_id = auth.uid()
));
