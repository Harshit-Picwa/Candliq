import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/header";
import { DesktopOnlyGuard } from "@/components/desktop-only-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, User, Mail, ShieldCheck, Camera, Save, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function AccountPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setProfileImageUrl(user.profileImageUrl || "");
      // After user data refreshes (e.g. after save), go back to view mode.
      setIsEditing(false);
    }
  }, [user]);

  const isDirty =
    (firstName || "") !== (user?.firstName || "") ||
    (lastName || "") !== (user?.lastName || "") ||
    (profileImageUrl || "") !== (user?.profileImageUrl || "");

  const updateProfile = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; profileImageUrl?: string }) => {
      const res = await apiRequest("PATCH", "/api/auth/profile", data);
      return await res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/auth/user"], updatedUser);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Profile Updated", description: "Your account details have been saved successfully." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Update Failed", 
        description: error?.message || "There was an error updating your profile.", 
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditing || !isDirty) return;
    updateProfile.mutate({ firstName, lastName, profileImageUrl: profileImageUrl || undefined });
  };

  const getInitials = () => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "U";
  };

  return (
    <DesktopOnlyGuard>
      <div className="min-h-screen page-gradient">
        <Header />
        <main className="max-w-3xl mx-auto px-6 py-12">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-background/80">
              <Link href="/dashboard">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground/90">Account Settings</h1>
              <p className="text-sm text-muted-foreground font-medium">Manage your personal information and preferences.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              <Card className="rounded-3xl border-border/40 shadow-xl shadow-primary/5 overflow-hidden bg-card/50 backdrop-blur-sm">
                <CardHeader className="p-8 pb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-xl font-black tracking-tight">Public Profile</CardTitle>
                  </div>
                  <CardDescription className="text-sm font-medium ml-13">
                    This information will be displayed on your profile.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-8 pt-4 space-y-8">
                  <div className="flex flex-col sm:flex-row items-center gap-8 mb-4">
                    <div className="relative group">
                      <Avatar className="h-24 w-24 border-4 border-background shadow-xl ring-1 ring-border/40 transition-transform group-hover:scale-105 duration-300">
                        <AvatarImage src={profileImageUrl || undefined} />
                        <AvatarFallback className="text-2xl font-black bg-primary text-white">{getInitials()}</AvatarFallback>
                      </Avatar>
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border border-white/20 backdrop-blur-[2px]">
                        <Camera className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    <div className="flex-1 w-full space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="avatar-url" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Profile Image URL</Label>
                        <Input
                          id="avatar-url"
                          value={profileImageUrl}
                          onChange={(e) => setProfileImageUrl(e.target.value)}
                          disabled={!isEditing}
                          placeholder="https://example.com/avatar.jpg"
                          className="h-11 rounded-xl border-border/60 bg-background/50 focus-visible:ring-primary/20 transition-all px-4 disabled:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-70"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="first-name" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">First Name</Label>
                      <Input
                        id="first-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        disabled={!isEditing}
                        required
                        className="h-11 rounded-xl border-border/60 bg-background/50 focus-visible:ring-primary/20 transition-all px-4 disabled:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-70"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last-name" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Last Name</Label>
                      <Input
                        id="last-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={!isEditing}
                        required
                        className="h-11 rounded-xl border-border/60 bg-background/50 focus-visible:ring-primary/20 transition-all px-4 disabled:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-70"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-border/40 shadow-xl shadow-primary/5 overflow-hidden bg-card/50 backdrop-blur-sm opacity-80">
                <CardHeader className="p-8 pb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-2xl bg-muted flex items-center justify-center">
                      <Mail className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-xl font-black tracking-tight">Security Information</CardTitle>
                  </div>
                  <CardDescription className="text-sm font-medium ml-13">
                    These details are linked to your account security.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-8 pt-4 space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Email Address</Label>
                    <div className="relative">
                      <Input
                        id="email"
                        value={user?.email || ""}
                        disabled
                        className="h-11 rounded-xl border-border/60 bg-muted/20 pl-10 cursor-not-allowed opacity-70 font-medium"
                      />
                      <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60" />
                    </div>
                    <p className="text-[10px] text-muted-foreground font-bold ml-1 italic">* Email cannot be changed for security reasons.</p>
                  </div>
                </CardContent>
                <CardFooter className="bg-muted/30 border-t border-border/40 px-8 py-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Signed in since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "unknown"}</p>
                </CardFooter>
              </Card>

              <div className="flex justify-end items-center gap-4 py-4">
                {!isEditing ? (
                  <Button
                    type="button"
                    className="rounded-xl px-8 h-12 font-black text-base shadow-lg shadow-primary/20 gap-2.5 bg-primary hover:scale-[1.02] active:scale-[0.98] transition-all min-w-[160px]"
                    onClick={() => setIsEditing(true)}
                  >
                    <User className="w-5 h-5" />
                    Edit Details
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-xl font-bold px-6 h-12"
                      onClick={() => {
                        setFirstName(user?.firstName || "");
                        setLastName(user?.lastName || "");
                        setProfileImageUrl(user?.profileImageUrl || "");
                        setIsEditing(false);
                      }}
                      disabled={updateProfile.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateProfile.isPending || !isDirty}
                      className="rounded-xl px-8 h-12 font-black text-base shadow-lg shadow-primary/20 gap-2.5 bg-primary hover:scale-[1.02] active:scale-[0.98] transition-all min-w-[160px] disabled:opacity-60 disabled:hover:scale-100"
                    >
                      {updateProfile.isPending ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5" />
                          Save Details
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </form>
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
