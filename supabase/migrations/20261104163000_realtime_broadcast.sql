-- Migration: 20261104163000_realtime_broadcast.sql
-- Enables Realtime broadcast for per-analysis and per-org progress updates

-- 1. RLS policy on realtime.messages for authenticated users
DROP POLICY IF EXISTS "Allow authenticated users to receive analysis broadcasts for their org" ON realtime.messages;
DROP POLICY IF EXISTS "Allow authenticated users to receive org broadcasts" ON realtime.messages;

CREATE POLICY "Allow authenticated users to receive org and analysis broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND (
    realtime.topic() = 'org:' || public.auth_org_id()
    OR
    EXISTS (
      SELECT 1 FROM public.analyses a
      WHERE 'analysis:' || a.id::text = realtime.topic()
        AND a.org_id = public.auth_org_id()
    )
  )
);

-- 2. Trigger function to broadcast analysis stage changes
CREATE OR REPLACE FUNCTION public.broadcast_analysis_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime, pg_temp
AS $$
DECLARE
  payload jsonb;
BEGIN
  IF (TG_OP = 'INSERT') OR 
     (OLD.stage IS DISTINCT FROM NEW.stage) OR 
     (OLD.stage_message IS DISTINCT FROM NEW.stage_message) OR
     (OLD.status IS DISTINCT FROM NEW.status) OR
     (OLD.error_message IS DISTINCT FROM NEW.error_message) THEN

    payload := jsonb_build_object(
      'analysis_id', NEW.id,
      'project_id', NEW.project_id,
      'stage', NEW.stage,
      'message', NEW.stage_message,
      'status', NEW.status,
      'error_message', NEW.error_message
    );

    -- Broadcast to per-analysis channel
    PERFORM realtime.send(
      payload,
      'stage_change',
      'analysis:' || NEW.id::text,
      true
    );

    -- Broadcast to organization channel
    IF NEW.org_id IS NOT NULL THEN
      PERFORM realtime.send(
        payload,
        'stage_change',
        'org:' || NEW.org_id,
        true
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger on analyses table
DROP TRIGGER IF EXISTS trigger_broadcast_analysis_stage ON public.analyses;
CREATE TRIGGER trigger_broadcast_analysis_stage
AFTER INSERT OR UPDATE ON public.analyses
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_analysis_stage();
