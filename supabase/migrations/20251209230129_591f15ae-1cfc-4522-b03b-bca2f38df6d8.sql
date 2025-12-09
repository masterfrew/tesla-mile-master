-- Add frankvanderbijl@gmail.com as admin
INSERT INTO public.user_roles (user_id, role) 
VALUES ('2a33aba1-19eb-4204-875d-eebaad76b6fe', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;