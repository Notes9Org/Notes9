-- Fix: Auto-create SEPARATE organization for each new user (Single User MVP)
-- This ensures data isolation between users

-- Updated function to create individual organizations
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  user_full_name text;
BEGIN
  -- Create organization name from user's name or email
  user_full_name := COALESCE(
    TRIM(CONCAT(
      NEW.raw_user_meta_data->>'first_name', 
      ' ', 
      NEW.raw_user_meta_data->>'last_name'
    )),
    SPLIT_PART(NEW.email, '@', 1)
  );

  -- Create a new organization for this user
  INSERT INTO public.organizations (name, email)
  VALUES (
    user_full_name || '''s Lab',
    NEW.email
  )
  RETURNING id INTO new_org_id;

  -- Create profile linked to the new organization
  INSERT INTO public.profiles (id, first_name, last_name, email, role, organization_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'researcher'),
    new_org_id
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update existing users to have their own organizations
DO $$
DECLARE
  user_record RECORD;
  new_org_id uuid;
BEGIN
  -- Loop through users who are sharing the default organization
  FOR user_record IN 
    SELECT p.id, p.email, p.first_name, p.last_name, p.organization_id
    FROM profiles p
    WHERE p.organization_id = '00000000-0000-0000-0000-000000000001'
  LOOP
    -- Create a new organization for each user
    INSERT INTO organizations (name, email)
    VALUES (
      COALESCE(TRIM(user_record.first_name || ' ' || user_record.last_name), SPLIT_PART(user_record.email, '@', 1)) || '''s Lab',
      user_record.email
    )
    RETURNING id INTO new_org_id;

    -- Update the user's profile to point to their new organization
    UPDATE profiles
    SET organization_id = new_org_id
    WHERE id = user_record.id;

    -- Update all their existing data to new organization
    UPDATE projects SET organization_id = new_org_id WHERE created_by = user_record.id;
    UPDATE protocols SET organization_id = new_org_id WHERE created_by = user_record.id;
    UPDATE literature_reviews SET organization_id = new_org_id WHERE created_by = user_record.id;
    -- Note: equipment and samples don't have created_by, they inherit organization via other relationships

    RAISE NOTICE 'Created organization % for user %', new_org_id, user_record.email;
  END LOOP;
END $$;

SELECT 'Fixed: Each user now has their own organization for data isolation' AS status;

