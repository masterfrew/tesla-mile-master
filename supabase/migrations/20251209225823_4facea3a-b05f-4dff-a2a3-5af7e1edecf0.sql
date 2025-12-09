-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Admins can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create admin-only view of profiles for user management
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
    user_id uuid,
    email text,
    first_name text,
    last_name text,
    company_name text,
    subscription_tier text,
    has_tesla_connected boolean,
    created_at timestamp with time zone,
    vehicle_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.company_name,
    p.subscription_tier,
    (p.tesla_access_token IS NOT NULL) as has_tesla_connected,
    p.created_at,
    (SELECT COUNT(*) FROM public.vehicles v WHERE v.user_id = p.user_id) as vehicle_count
  FROM public.profiles p
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY p.created_at DESC
$$;

-- Create function to get dashboard stats for admin
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS TABLE (
    total_users bigint,
    users_with_tesla bigint,
    total_vehicles bigint,
    total_mileage_readings bigint,
    active_today bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    (SELECT COUNT(*) FROM public.profiles) as total_users,
    (SELECT COUNT(*) FROM public.profiles WHERE tesla_access_token IS NOT NULL) as users_with_tesla,
    (SELECT COUNT(*) FROM public.vehicles WHERE is_active = true) as total_vehicles,
    (SELECT COUNT(*) FROM public.mileage_readings) as total_mileage_readings,
    (SELECT COUNT(DISTINCT user_id) FROM public.mileage_readings WHERE reading_date = CURRENT_DATE) as active_today
  WHERE public.has_role(auth.uid(), 'admin')
$$;