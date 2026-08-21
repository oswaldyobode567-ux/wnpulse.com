import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
Smartphone,
Copy,
Crown,
Sparkles,
CheckCircle2,
Loader2,
ArrowRight,
ArrowLeft,
MessageCircle,
ShieldCheck,
Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

// CORRECTIF : ce fichier avait son PROPRE TIER_CONFIG code en dur (Pro a
// 4 900 FCFA, Elite a 1
