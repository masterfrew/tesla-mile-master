import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Car, Settings, LogOut, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminCheck } from '@/hooks/useAdminCheck';

export const AppNav: React.FC = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdminCheck();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="border-b bg-card sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">

        {/* Left: Brand + Nav */}
        <div className="flex items-center gap-5">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="bg-primary p-1.5 rounded-lg">
              <Car className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm hidden sm:inline">KM Track</span>
          </Link>

          <nav className="flex items-center gap-0.5">
            <Link to="/">
              <Button
                variant={isActive('/') ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-3 text-sm"
              >
                Overzicht
              </Button>
            </Link>
            <Link to="/trips">
              <Button
                variant={isActive('/trips') ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-3 text-sm"
              >
                Ritten
              </Button>
            </Link>
          </nav>
        </div>

        {/* Right: User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal py-1.5">
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isAdmin && (
              <>
                <Link to="/admin">
                  <DropdownMenuItem>
                    <Shield className="h-4 w-4 mr-2" />
                    Admin dashboard
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-2" />
              Uitloggen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

      </div>
    </header>
  );
};
