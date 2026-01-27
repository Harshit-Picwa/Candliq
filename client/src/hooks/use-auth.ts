import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  // If not authenticated, return null
  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    // For other errors, also return null (user is not authenticated)
    return null;
  }

  try {
    const data = await response.json();
    // If response is null or empty, user is not authenticated
    if (!data || !data.id) {
      return null;
    }
    return data;
  } catch (error) {
    // If JSON parsing fails, user is not authenticated
    return null;
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Logout failed");
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Clear the query cache
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      
      // Redirect to login page
      window.location.href = "/login";
    },
    onError: (error) => {
      console.error("Logout error:", error);
      // Even if there's an error, clear cache and try to redirect
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      window.location.href = "/login";
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: () => logoutMutation.mutate(),
    isLoggingOut: logoutMutation.isPending,
  };
}
