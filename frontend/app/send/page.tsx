"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider, useCurrencySymbol } from "@/lib/web3modal";
import { BrowserProvider, formatEther, parseEther, hexlify, toUtf8Bytes } from "ethers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Search,
  Check,
  AlertCircle,
  Loader2,
  Wallet,
  Globe,
  ExternalLink,
  MessageSquare,
  Clock,
  ArrowRight,
  Zap,
  Shield,
  Sparkles,
} from "lucide-react";
import { resolveAddress, ResolveResult } from "@/services/api";

// ─── Animated Circuit Board Background ───
function CircuitBackground() {
  // Comprehensive PCB trace layout — ~160 paths for maximum density
  const traces = [
    // ══════ HORIZONTAL MAIN BUSES (power rails) ══════
    "M0,60 H90 L110,80 H240 L260,60 H400 L420,80 H560 L580,60 H720 L740,80 H1000",
    "M0,150 H70 L90,130 H180 L200,150 H350 L370,130 H480 L500,150 H650 L670,130 H780 L800,150 H1000",
    "M0,240 H50 L70,260 H140 L160,240 H300 L320,260 H440 L460,240 H600 L620,260 H760 L780,240 H1000",
    "M0,330 H80 L100,310 H220 L240,330 H380 L400,310 H520 L540,330 H680 L700,310 H820 L840,330 H1000",
    "M0,420 H60 L80,440 H200 L220,420 H360 L380,440 H500 L520,420 H660 L680,440 H800 L820,420 H1000",
    "M0,510 H100 L120,490 H260 L280,510 H420 L440,490 H560 L580,510 H720 L740,490 H880 L900,510 H1000",
    "M0,600 H70 L90,620 H180 L200,600 H340 L360,620 H480 L500,600 H640 L660,620 H780 L800,600 H1000",
    "M0,690 H120 L140,670 H280 L300,690 H440 L460,670 H600 L620,690 H760 L780,670 H1000",
    // ══════ VERTICAL MAIN BUSES (signal rails) ══════
    "M80,0 V50 L100,70 V160 L80,180 V270 L100,290 V380 L80,400 V490 L100,510 V600 L80,620 V750",
    "M200,0 V80 L220,100 V190 L200,210 V300 L220,320 V410 L200,430 V520 L220,540 V630 L200,650 V750",
    "M320,0 V60 L340,80 V170 L320,190 V280 L340,300 V390 L320,410 V500 L340,520 V610 L320,630 V750",
    "M440,0 V70 L460,90 V180 L440,200 V290 L460,310 V400 L440,420 V510 L460,530 V620 L440,640 V750",
    "M560,0 V50 L580,70 V160 L560,180 V270 L580,290 V380 L560,400 V490 L580,510 V600 L560,620 V750",
    "M680,0 V80 L700,100 V190 L680,210 V300 L700,320 V410 L680,430 V520 L700,540 V630 L680,650 V750",
    "M800,0 V60 L820,80 V170 L800,190 V280 L820,300 V390 L800,410 V500 L820,520 V610 L800,630 V750",
    "M920,0 V70 L940,90 V180 L920,200 V290 L940,310 V400 L920,420 V510 L940,530 V620 L920,640 V750",
    // ══════ SECONDARY HORIZONTAL TRACES ══════
    "M0,105 H150 L170,120 H350 L370,105 H550 L570,120 H750",
    "M250,195 H450 L470,210 H650 L670,195 H850",
    "M0,285 H100 L120,300 H280 L300,285 H500 L520,300 H700",
    "M150,375 H350 L370,390 H550 L570,375 H800",
    "M0,465 H200 L220,480 H400 L420,465 H620 L640,480 H850",
    "M100,555 H300 L320,570 H500 L520,555 H750",
    "M0,645 H150 L170,660 H350 L370,645 H600",
    "M200,735 H400 L420,720 H620 L640,735 H900",
    // ══════ SECONDARY VERTICAL TRACES ══════
    "M140,0 V120 L160,140 V260 L140,280 V400 L160,420 V540 L140,560 V750",
    "M260,100 V220 L280,240 V360 L260,380 V500 L280,520 V650",
    "M380,0 V90 L400,110 V230 L380,250 V370 L400,390 V510 L380,530 V750",
    "M500,50 V170 L520,190 V310 L500,330 V450 L520,470 V590 L500,610 V750",
    "M620,0 V110 L640,130 V250 L620,270 V390 L640,410 V530 L620,550 V750",
    "M740,80 V200 L760,220 V340 L740,360 V480 L760,500 V620 L740,640 V750",
    "M860,0 V100 L880,120 V240 L860,260 V380 L880,400 V520 L860,540 V750",
    // ══════ DIAGONAL INTERCONNECTS ══════
    "M50,30 L100,80 V130 L140,170",
    "M180,50 L240,110 V170 L300,230",
    "M310,30 L380,100 V160 L440,220",
    "M470,50 L540,120 V180 L600,240",
    "M630,30 L700,100 V160 L760,220",
    "M790,50 L860,120 V180 L920,240",
    // Reverse diagonals
    "M150,240 L100,290 V340 L50,390",
    "M350,240 L300,290 V340 L250,390",
    "M550,240 L500,290 V340 L450,390",
    "M750,240 L700,290 V340 L650,390",
    // Bottom-half diagonals
    "M50,450 L120,520 V570 L180,630",
    "M250,430 L320,500 V560 L380,620",
    "M450,450 L520,520 V570 L580,630",
    "M650,430 L720,500 V560 L780,620",
    "M850,450 L920,520 V570 L960,610",
    // ══════ IC PACKAGES — 8 chip outlines ══════
    "M120,85 H190 V145 H120 V85",   // IC1 top-left
    "M310,85 H380 V145 H310 V85",   // IC2 top-center
    "M520,85 H590 V145 H520 V85",   // IC3 top-right
    "M710,85 H780 V145 H710 V85",   // IC4 far-right
    "M120,325 H190 V385 H120 V325",  // IC5 mid-left
    "M310,325 H380 V385 H310 V325",  // IC6 mid-center
    "M520,325 H590 V385 H520 V325",  // IC7 mid-right
    "M710,325 H780 V385 H710 V325",  // IC8 far-right
    // ══════ IC PIN TRACES (4 pins per side, 8 ICs = 128 pin traces) ══════
    // IC1 pins
    "M120,95 H100", "M120,105 H100", "M120,115 H100", "M120,125 H100", "M120,135 H100",
    "M190,95 H210", "M190,105 H210", "M190,115 H210", "M190,125 H210", "M190,135 H210",
    "M135,85 V65", "M145,85 V65", "M155,85 V65", "M165,85 V65", "M175,85 V65",
    "M135,145 V165", "M145,145 V165", "M155,145 V165", "M165,145 V165", "M175,145 V165",
    // IC2 pins
    "M310,95 H290", "M310,105 H290", "M310,115 H290", "M310,125 H290", "M310,135 H290",
    "M380,95 H400", "M380,105 H400", "M380,115 H400", "M380,125 H400", "M380,135 H400",
    "M325,85 V65", "M335,85 V65", "M345,85 V65", "M355,85 V65", "M365,85 V65",
    "M325,145 V165", "M335,145 V165", "M345,145 V165", "M355,145 V165", "M365,145 V165",
    // IC3 pins
    "M520,95 H500", "M520,105 H500", "M520,115 H500", "M520,125 H500", "M520,135 H500",
    "M590,95 H610", "M590,105 H610", "M590,115 H610", "M590,125 H610", "M590,135 H610",
    "M535,85 V65", "M545,85 V65", "M555,85 V65", "M565,85 V65", "M575,85 V65",
    "M535,145 V165", "M545,145 V165", "M555,145 V165", "M565,145 V165", "M575,145 V165",
    // IC4 pins
    "M710,95 H690", "M710,105 H690", "M710,115 H690", "M710,125 H690", "M710,135 H690",
    "M780,95 H800", "M780,105 H800", "M780,115 H800", "M780,125 H800", "M780,135 H800",
    "M725,85 V65", "M735,85 V65", "M745,85 V65", "M755,85 V65", "M765,85 V65",
    "M725,145 V165", "M735,145 V165", "M745,145 V165", "M755,145 V165", "M765,145 V165",
    // IC5 pins
    "M120,335 H100", "M120,345 H100", "M120,355 H100", "M120,365 H100", "M120,375 H100",
    "M190,335 H210", "M190,345 H210", "M190,355 H210", "M190,365 H210", "M190,375 H210",
    "M135,325 V305", "M145,325 V305", "M155,325 V305", "M165,325 V305", "M175,325 V305",
    "M135,385 V405", "M145,385 V405", "M155,385 V405", "M165,385 V405", "M175,385 V405",
    // IC6 pins
    "M310,335 H290", "M310,345 H290", "M310,355 H290", "M310,365 H290", "M310,375 H290",
    "M380,335 H400", "M380,345 H400", "M380,355 H400", "M380,365 H400", "M380,375 H400",
    "M325,325 V305", "M335,325 V305", "M345,325 V305", "M355,325 V305", "M365,325 V305",
    "M325,385 V405", "M335,385 V405", "M345,385 V405", "M355,385 V405", "M365,385 V405",
    // IC7 pins
    "M520,335 H500", "M520,345 H500", "M520,355 H500", "M520,365 H500", "M520,375 H500",
    "M590,335 H610", "M590,345 H610", "M590,355 H610", "M590,365 H610", "M590,375 H610",
    "M535,325 V305", "M545,325 V305", "M555,325 V305", "M565,325 V305", "M575,325 V305",
    "M535,385 V405", "M545,385 V405", "M555,385 V405", "M565,385 V405", "M575,385 V405",
    // IC8 pins
    "M710,335 H690", "M710,345 H690", "M710,355 H690", "M710,365 H690", "M710,375 H690",
    "M780,335 H800", "M780,345 H800", "M780,355 H800", "M780,365 H800", "M780,375 H800",
    "M725,325 V305", "M735,325 V305", "M745,325 V305", "M755,325 V305", "M765,325 V305",
    "M725,385 V405", "M735,385 V405", "M745,385 V405", "M755,385 V405", "M765,385 V405",
    // ══════ DIFFERENTIAL PAIRS (parallel traces) ══════
    "M0,170 H80 L100,185 H250 L270,170 H420", "M0,174 H78 L98,189 H248 L268,174 H418",
    "M580,170 H720 L740,185 H900 L920,170 H1000", "M580,174 H718 L738,189 H898 L918,174 H1000",
    "M0,410 H60 L80,425 H200 L220,410 H380", "M0,414 H58 L78,429 H198 L218,414 H378",
    "M620,410 H760 L780,425 H920 L940,410 H1000", "M620,414 H758 L778,429 H918 L938,414 H1000",
    // ══════ CURVED MICROSTRIP TRACES ══════
    "M50,190 Q70,190 70,210 Q70,230 90,230",
    "M230,190 Q250,190 250,210 Q250,230 270,230",
    "M410,190 Q430,190 430,210 Q430,230 450,230",
    "M590,190 Q610,190 610,210 Q610,230 630,230",
    "M770,190 Q790,190 790,210 Q790,230 810,230",
    "M50,430 Q70,430 70,450 Q70,470 90,470",
    "M230,430 Q250,430 250,450 Q250,470 270,470",
    "M410,430 Q430,430 430,450 Q430,470 450,470",
    "M590,430 Q610,430 610,450 Q610,470 630,470",
    "M770,430 Q790,430 790,450 Q790,470 810,470",
    // S-curves
    "M40,530 Q60,530 60,550 Q60,570 80,570 Q100,570 100,590 Q100,610 120,610",
    "M440,530 Q460,530 460,550 Q460,570 480,570 Q500,570 500,590 Q500,610 520,610",
    "M840,530 Q860,530 860,550 Q860,570 880,570 Q900,570 900,590 Q900,610 920,610",
    // ══════ RESISTOR/CAPACITOR PADS ══════
    "M60,270 H66 M74,270 H80", "M160,270 H166 M174,270 H180",
    "M260,270 H266 M274,270 H280", "M360,270 H366 M374,270 H380",
    "M460,270 H466 M474,270 H480", "M560,270 H566 M574,270 H580",
    "M660,270 H666 M674,270 H680", "M760,270 H766 M774,270 H780",
    "M60,510 H66 M74,510 H80", "M160,510 H166 M174,510 H180",
    "M260,510 H266 M274,510 H280", "M360,510 H366 M374,510 H380",
    "M460,510 H466 M474,510 H480", "M560,510 H566 M574,510 H580",
    "M660,510 H666 M674,510 H680", "M760,510 H766 M774,510 H780",
    // ══════ EDGE CONNECTOR TRACES ══════
    "M0,20 H30 L50,40", "M0,40 H20 L40,20",
    "M0,680 H30 L50,660", "M0,700 H40 L60,720",
    "M0,720 H30 L50,740", "M0,740 H20",
    "M960,20 H1000", "M940,40 L960,20 H1000",
    "M960,680 H1000", "M940,700 L960,720 H1000",
    "M960,720 H1000", "M940,740 L960,720",
    // ══════ BGA/FANOUT TRACES (center region) ══════
    "M400,540 L420,560 H460 L480,540", "M400,540 L380,560 H340 L320,540",
    "M500,560 L520,580 H560 L580,560", "M300,560 L280,580 H240 L220,560",
    "M400,580 L420,600 H460 L480,580", "M400,580 L380,600 H340 L320,580",
    "M500,600 L520,620 H560 L580,600", "M300,600 L280,620 H240 L220,600",
    // ══════ GROUND FILL STITCHING VIAS (tiny stubs) ══════
    "M30,100 V103", "M30,200 V203", "M30,300 V303", "M30,400 V403", "M30,500 V503", "M30,600 V603",
    "M970,100 V103", "M970,200 V203", "M970,300 V303", "M970,400 V403", "M970,500 V503", "M970,600 V603",
    "M500,30 H503", "M600,30 H603", "M700,30 H703", "M500,720 H503", "M600,720 H603", "M700,720 H703",
  ];

  // Junction nodes — all intersections and solder points
  const nodes: number[][] = [
    // Horizontal bus junctions
    [90,60],[110,80],[240,60],[260,60],[400,60],[420,80],[560,60],[580,60],[720,60],[740,80],
    [70,150],[90,130],[180,130],[200,150],[350,150],[370,130],[480,130],[500,150],[650,150],[670,130],[780,130],[800,150],
    [50,240],[70,260],[140,260],[160,240],[300,240],[320,260],[440,260],[460,240],[600,240],[620,260],[760,260],[780,240],
    [80,330],[100,310],[220,310],[240,330],[380,330],[400,310],[520,310],[540,330],[680,330],[700,310],[820,310],[840,330],
    [60,420],[80,440],[200,440],[220,420],[360,420],[380,440],[500,440],[520,420],[660,420],[680,440],[800,440],[820,420],
    [100,510],[120,490],[260,490],[280,510],[420,510],[440,490],[560,490],[580,510],[720,510],[740,490],[880,490],[900,510],
    [70,600],[90,620],[180,620],[200,600],[340,600],[360,620],[480,620],[500,600],[640,600],[660,620],[780,620],[800,600],
    [120,690],[140,670],[280,670],[300,690],[440,690],[460,670],[600,670],[620,690],[760,690],[780,670],
    // Vertical bus junctions
    [80,50],[100,70],[80,180],[100,160],[80,270],[100,290],[80,400],[100,380],[80,490],[100,510],[80,620],[100,600],
    [200,80],[220,100],[200,210],[220,190],[200,300],[220,320],[200,430],[220,410],[200,520],[220,540],[200,650],[220,630],
    [320,60],[340,80],[320,190],[340,170],[320,280],[340,300],[320,410],[340,390],[320,500],[340,520],[320,630],[340,610],
    [440,70],[460,90],[440,200],[460,180],[440,290],[460,310],[440,420],[460,400],[440,510],[460,530],[440,640],[460,620],
    [560,50],[580,70],[560,180],[580,160],[560,270],[580,290],[560,400],[580,380],[560,490],[580,510],[560,620],[580,600],
    [680,80],[700,100],[680,210],[700,190],[680,300],[700,320],[680,430],[700,410],[680,520],[700,540],[680,650],[700,630],
    // IC corner nodes
    [120,85],[190,85],[120,145],[190,145], [310,85],[380,85],[310,145],[380,145],
    [520,85],[590,85],[520,145],[590,145], [710,85],[780,85],[710,145],[780,145],
    [120,325],[190,325],[120,385],[190,385], [310,325],[380,325],[310,385],[380,385],
    [520,325],[590,325],[520,385],[590,385], [710,325],[780,325],[710,385],[780,385],
  ];

  // Via holes with graduated sizing
  const vias: number[][] = [
    // IC corner vias
    [120,85],[190,145],[310,85],[380,145],[520,85],[590,145],[710,85],[780,145],
    [120,325],[190,385],[310,325],[380,385],[520,325],[590,385],[710,325],[780,385],
    // Power rail vias
    [80,60],[200,150],[320,240],[440,330],[560,420],[680,510],[800,600],
    [920,60],[800,150],[680,240],[560,330],[440,420],[320,510],[200,600],
    // Signal vias (smaller)
    [155,115],[345,115],[555,115],[745,115],
    [155,355],[345,355],[555,355],[745,355],
    [400,540],[400,580],[500,560],[300,560],
  ];

  // Resistor/capacitor pad rectangles (center points)
  const passives: number[][] = [
    [70,270],[170,270],[270,270],[370,270],[470,270],[570,270],[670,270],[770,270],
    [70,510],[170,510],[270,510],[370,510],[470,510],[570,510],[670,510],[770,510],
  ];

  // Energy pulses — NO short-path pulsers, only long flowing traces
  const pulses = [
    // Horizontal bus pulses (medium speed, full width)
    { path: "M0,60 H90 L110,80 H240 L260,60 H400 L420,80 H560 L580,60 H720 L740,80 H1000", dur: "5s", delay: "0s", size: 2.5 },
    { path: "M0,150 H70 L90,130 H180 L200,150 H350 L370,130 H480 L500,150 H650 L670,130 H780 L800,150 H1000", dur: "6s", delay: "1.2s", size: 2 },
    { path: "M0,240 H50 L70,260 H140 L160,240 H300 L320,260 H440 L460,240 H600 L620,260 H760 L780,240 H1000", dur: "5.5s", delay: "0.6s", size: 2.5 },
    { path: "M0,330 H80 L100,310 H220 L240,330 H380 L400,310 H520 L540,330 H680 L700,310 H820 L840,330 H1000", dur: "6.5s", delay: "2s", size: 2 },
    { path: "M0,420 H60 L80,440 H200 L220,420 H360 L380,440 H500 L520,420 H660 L680,440 H800 L820,420 H1000", dur: "5s", delay: "0.8s", size: 2.5 },
    { path: "M0,510 H100 L120,490 H260 L280,510 H420 L440,490 H560 L580,510 H720 L740,490 H880 L900,510 H1000", dur: "7s", delay: "1.5s", size: 2 },
    { path: "M0,600 H70 L90,620 H180 L200,600 H340 L360,620 H480 L500,600 H640 L660,620 H780 L800,600 H1000", dur: "5.5s", delay: "0.3s", size: 2.5 },
    { path: "M0,690 H120 L140,670 H280 L300,690 H440 L460,670 H600 L620,690 H760 L780,670 H1000", dur: "6s", delay: "2.5s", size: 2 },
    // Vertical bus pulses (slower)
    { path: "M80,0 V50 L100,70 V160 L80,180 V270 L100,290 V380 L80,400 V490 L100,510 V600 L80,620 V750", dur: "9s", delay: "0s", size: 2 },
    { path: "M200,0 V80 L220,100 V190 L200,210 V300 L220,320 V410 L200,430 V520 L220,540 V630 L200,650 V750", dur: "10s", delay: "1.5s", size: 2 },
    { path: "M320,0 V60 L340,80 V170 L320,190 V280 L340,300 V390 L320,410 V500 L340,520 V610 L320,630 V750", dur: "8.5s", delay: "0.7s", size: 2.5 },
    { path: "M440,0 V70 L460,90 V180 L440,200 V290 L460,310 V400 L440,420 V510 L460,530 V620 L440,640 V750", dur: "11s", delay: "2s", size: 2 },
    { path: "M560,0 V50 L580,70 V160 L560,180 V270 L580,290 V380 L560,400 V490 L580,510 V600 L560,620 V750", dur: "9.5s", delay: "0.4s", size: 2.5 },
    { path: "M680,0 V80 L700,100 V190 L680,210 V300 L700,320 V410 L680,430 V520 L700,540 V630 L680,650 V750", dur: "8s", delay: "1.8s", size: 2 },
    { path: "M800,0 V60 L820,80 V170 L800,190 V280 L820,300 V390 L800,410 V500 L820,520 V610 L800,630 V750", dur: "10.5s", delay: "0.9s", size: 2 },
    { path: "M920,0 V70 L940,90 V180 L920,200 V290 L940,310 V400 L920,420 V510 L940,530 V620 L920,640 V750", dur: "9s", delay: "3s", size: 2 },
    // Diagonal express pulses (fast)
    { path: "M50,30 L100,80 V130 L140,170", dur: "2.2s", delay: "0s", size: 2 },
    { path: "M310,30 L380,100 V160 L440,220", dur: "2.5s", delay: "0.8s", size: 2 },
    { path: "M630,30 L700,100 V160 L760,220", dur: "2s", delay: "1.6s", size: 2.5 },
    { path: "M150,240 L100,290 V340 L50,390", dur: "2.8s", delay: "0.4s", size: 2 },
    { path: "M550,240 L500,290 V340 L450,390", dur: "2.3s", delay: "1.2s", size: 2 },
    { path: "M50,450 L120,520 V570 L180,630", dur: "2.6s", delay: "0.6s", size: 2 },
    { path: "M450,450 L520,520 V570 L580,630", dur: "2.4s", delay: "2s", size: 2 },
    { path: "M850,450 L920,520 V570 L960,610", dur: "2s", delay: "1s", size: 2 },
    // S-curve pulses (elegant slow)
    { path: "M40,530 Q60,530 60,550 Q60,570 80,570 Q100,570 100,590 Q100,610 120,610", dur: "3s", delay: "0.5s", size: 2 },
    { path: "M440,530 Q460,530 460,550 Q460,570 480,570 Q500,570 500,590 Q500,610 520,610", dur: "3.2s", delay: "1.5s", size: 2 },
    { path: "M840,530 Q860,530 860,550 Q860,570 880,570 Q900,570 900,590 Q900,610 920,610", dur: "2.8s", delay: "2.5s", size: 2 },
    // Differential pair pulses
    { path: "M0,170 H80 L100,185 H250 L270,170 H420", dur: "3.5s", delay: "0s", size: 1.8 },
    { path: "M580,170 H720 L740,185 H900 L920,170 H1000", dur: "3.5s", delay: "1.8s", size: 1.8 },
    { path: "M0,410 H60 L80,425 H200 L220,410 H380", dur: "3s", delay: "0.9s", size: 1.8 },
    { path: "M620,410 H760 L780,425 H920 L940,410 H1000", dur: "3s", delay: "2.7s", size: 1.8 },
    // BGA fanout pulses (medium speed)
    { path: "M400,540 L420,560 H460 L480,540", dur: "1.8s", delay: "0s", size: 2 },
    { path: "M400,540 L380,560 H340 L320,540", dur: "1.8s", delay: "0.9s", size: 2 },
    { path: "M400,580 L420,600 H460 L480,580", dur: "2s", delay: "1.5s", size: 2 },
    { path: "M400,580 L380,600 H340 L320,580", dur: "2s", delay: "0.3s", size: 2 },
  ];

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      <svg
        viewBox="0 0 1000 750"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Energy pulse glow — intense blue */}
          <filter id="pulse-glow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur2" />
            <feMerge>
              <feMergeNode in="blur1" />
              <feMergeNode in="blur2" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Trail glow — softer */}
          <filter id="trail-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Via radial gradient */}
          <radialGradient id="via-grad">
            <stop offset="0%" stopColor="#1e40af" stopOpacity="0.7" />
            <stop offset="50%" stopColor="#1e3a5f" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </radialGradient>
          {/* Power via gradient */}
          <radialGradient id="pwr-via">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#1e3a5f" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ground plane grid — fine crosshatch */}
        <pattern id="pcb-grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#1e293b" strokeWidth="0.12" />
        </pattern>
        <rect width="1000" height="750" fill="url(#pcb-grid)" opacity="0.6" />

        {/* Solder mask keepout zones around ICs — subtle dark rectangles */}
        {[[120,85,70,60],[310,85,70,60],[520,85,70,60],[710,85,70,60],
          [120,325,70,60],[310,325,70,60],[520,325,70,60],[710,325,70,60]].map(([x,y,w,h], i) => (
          <rect key={`mask-${i}`} x={x-5} y={y-5} width={w+10} height={h+10} rx="3"
            fill="none" stroke="#1e293b" strokeWidth="0.6" strokeDasharray="3,3" opacity="0.4" />
        ))}

        {/* All PCB traces */}
        {traces.map((d, i) => (
          <path key={`t-${i}`} d={d} fill="none" stroke="#1e3a5f" strokeWidth="1"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
        ))}

        {/* Junction solder pads */}
        {nodes.map(([cx, cy], i) => (
          <circle key={`n-${i}`} cx={cx} cy={cy} r="1.8" fill="#1e3a5f" opacity="0.5" />
        ))}

        {/* Via holes — layered rings */}
        {vias.map(([cx, cy], i) => (
          <g key={`v-${i}`}>
            <circle cx={cx} cy={cy} r="5.5" fill="url(#via-grad)" />
            <circle cx={cx} cy={cy} r="3.5" fill="none" stroke="#1e40af" strokeWidth="0.4" opacity="0.35" />
            <circle cx={cx} cy={cy} r="1.2" fill="#2563eb" opacity="0.25" />
          </g>
        ))}

        {/* Passive component pads — tiny rectangles */}
        {passives.map(([cx, cy], i) => (
          <g key={`p-${i}`}>
            <rect x={cx-4} y={cy-2} width="3" height="4" rx="0.5" fill="#1e3a5f" opacity="0.4" />
            <rect x={cx+1} y={cy-2} width="3" height="4" rx="0.5" fill="#1e3a5f" opacity="0.4" />
          </g>
        ))}

        {/* ── Energy Pulses ── */}
        {pulses.map((p, i) => (
          <circle key={`p-${i}`} r={p.size} fill="#3b82f6" filter="url(#pulse-glow)" opacity="0.85">
            <animateMotion dur={p.dur} repeatCount="indefinite" begin={p.delay} path={p.path} />
          </circle>
        ))}

        {/* Secondary trail pulses — offset timing on horizontal + vertical buses */}
        {pulses.slice(0, 8).map((p, i) => (
          <circle key={`ht-${i}`} r={p.size * 0.5} fill="#60a5fa" filter="url(#trail-glow)" opacity="0.35">
            <animateMotion dur={p.dur} repeatCount="indefinite"
              begin={`${parseFloat(p.delay) + parseFloat(p.dur) * 0.4}s`} path={p.path} />
          </circle>
        ))}
        {pulses.slice(8, 16).map((p, i) => (
          <circle key={`vt-${i}`} r={p.size * 0.5} fill="#60a5fa" filter="url(#trail-glow)" opacity="0.35">
            <animateMotion dur={p.dur} repeatCount="indefinite"
              begin={`${parseFloat(p.delay) + parseFloat(p.dur) * 0.5}s`} path={p.path} />
          </circle>
        ))}
        {/* Third wave on main buses — even dimmer */}
        {pulses.slice(0, 4).map((p, i) => (
          <circle key={`hw3-${i}`} r={p.size * 0.35} fill="#93c5fd" filter="url(#trail-glow)" opacity="0.2">
            <animateMotion dur={p.dur} repeatCount="indefinite"
              begin={`${parseFloat(p.delay) + parseFloat(p.dur) * 0.7}s`} path={p.path} />
          </circle>
        ))}
      </svg>
    </div>
  );
}

type SendState = "idle" | "resolving" | "resolved" | "ready" | "sending" | "success" | "error";

interface SavedLookup {
  fqdn: string;
  address: string;
  timestamp: number;
}

const STORAGE_KEY = "hsr_send_history";
const MAX_HISTORY = 10;

// Helper functions for localStorage
const getSavedLookups = (): SavedLookup[] => {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

const saveLookup = (fqdn: string, address: string) => {
  if (typeof window === "undefined") return;
  try {
    const lookups = getSavedLookups().filter((l) => l.fqdn !== fqdn);
    lookups.unshift({ fqdn, address, timestamp: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lookups.slice(0, MAX_HISTORY)));
  } catch {
    // Ignore storage errors
  }
};

// Confetti piece component
function ConfettiPiece({ index }: { index: number }) {
  const style = useMemo(() => {
    const hue = (index * 47) % 360;
    const left = ((index * 31 + 17) % 100);
    const delay = ((index * 13) % 20) / 10;
    const duration = 1.5 + ((index * 7) % 10) / 10;
    const size = 4 + (index % 4) * 2;
    const rotation = (index * 73) % 360;
    return {
      position: "absolute" as const,
      left: `${left}%`,
      top: "-10px",
      width: `${size}px`,
      height: `${size * 1.5}px`,
      backgroundColor: `hsl(${hue}, 80%, 60%)`,
      borderRadius: index % 3 === 0 ? "50%" : "2px",
      transform: `rotate(${rotation}deg)`,
      animation: `confetti-fall ${duration}s ease-out ${delay}s forwards`,
      opacity: 0,
    };
  }, [index]);

  return <div style={style} />;
}

// Animated checkmark SVG
function AnimatedCheck() {
  return (
    <svg viewBox="0 0 50 50" className="w-16 h-16">
      <circle
        cx="25"
        cy="25"
        r="22"
        fill="none"
        stroke="hsl(158, 64%, 52%)"
        strokeWidth="2"
        className="animate-[scale-in_0.4s_ease-out_forwards]"
        style={{ transformOrigin: "center" }}
      />
      <path
        d="M14 25 L22 33 L36 18"
        fill="none"
        stroke="hsl(158, 64%, 52%)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 40,
          strokeDashoffset: 40,
          animation: "draw-check 0.5s ease-out 0.3s forwards",
        }}
      />
    </svg>
  );
}

// Step indicator
function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = [
    { label: "Recipient", icon: Globe },
    { label: "Amount", icon: Zap },
    { label: "Confirm", icon: Shield },
    { label: "Done", icon: Check },
  ];

  return (
    <div className="flex items-center justify-between mb-8 px-2">
      {steps.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === currentStep;
        const isComplete = i < currentStep;
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500
                  ${isComplete
                    ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 scale-90"
                    : isActive
                      ? "bg-primary/20 border-2 border-primary text-primary scale-110 shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                      : "bg-zinc-800/50 border border-zinc-700 text-zinc-600 scale-90"
                  }
                `}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={`text-[10px] font-medium tracking-wider uppercase transition-colors duration-300 ${
                  isActive ? "text-primary" : isComplete ? "text-emerald-400" : "text-zinc-600"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 mx-2 -mt-4">
                <div
                  className={`h-[2px] w-12 sm:w-16 transition-all duration-500 ${
                    isComplete ? "bg-emerald-500" : "bg-zinc-800"
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SendPage() {
  const searchParams = useSearchParams();
  const { open } = useWeb3Modal();
  const { address, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();
  const currencySymbol = useCurrencySymbol();

  // Form state
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [balance, setBalance] = useState<string | null>(null);

  // Resolution state
  const [resolvedData, setResolvedData] = useState<ResolveResult | null>(null);
  const [state, setState] = useState<SendState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Transaction state
  const [txHash, setTxHash] = useState<string | null>(null);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<SavedLookup[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recipientRef = useRef(recipient);
  recipientRef.current = recipient;

  // Load balance
  const loadBalance = useCallback(async () => {
    if (!walletProvider || !address) return;

    try {
      const provider = new BrowserProvider(walletProvider);
      const balanceWei = await provider.getBalance(address);
      setBalance(formatEther(balanceWei));
    } catch (err) {
      console.error("Failed to load balance:", err);
    }
  }, [walletProvider, address]);

  useEffect(() => {
    if (isConnected && walletProvider) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: load balance when wallet connects
      void loadBalance();
    }
  }, [isConnected, walletProvider, loadBalance]);

  // Check if input is a hex address
  const isHexAddress = (input: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(input);
  };

  // Check if input looks like a domain
  const isDomainFormat = (input: string): boolean => {
    return /^[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+$/.test(input);
  };

  // Resolve domain to address
  const handleResolve = useCallback(async (domainToResolve?: string) => {
    const input = domainToResolve || recipientRef.current.trim();
    if (!input) return;

    setError(null);
    setResolvedData(null);

    // If it's already a hex address, skip resolution
    if (isHexAddress(input)) {
      setResolvedData({
        fqdn: input,
        address: input,
        source: "owner",
        verified: true,
        resolver: null,
        tokenId: null,
        lastUpdated: null,
      });
      setState("resolved");
      return;
    }

    // Validate domain format
    if (!isDomainFormat(input)) {
      setError("Please enter a valid domain (e.g., gym.sexyness) or address (0x...)");
      setState("error");
      return;
    }

    setState("resolving");

    try {
      const result = await resolveAddress(input);

      if (!result.address) {
        setError(`No wallet address configured for ${input}`);
        setState("error");
        return;
      }

      setResolvedData(result);
      setState("resolved");
      // Save to history for autocomplete
      saveLookup(input, result.address);
    } catch (err) {
      console.error("Resolve error:", err);
      setError(err instanceof Error ? err.message : "Failed to resolve domain");
      setState("error");
    }
  }, []);

  // Handle URL parameters - reset form on navigation, pre-fill recipient if provided
  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: reset form state when URL changes */
  useEffect(() => {
    // Reset form state
    setRecipient("");
    setAmount("");
    setNote("");
    setResolvedData(null);
    setState("idle");
    setError(null);
    setTxHash(null);

    // Pre-fill recipient if provided
    const to = searchParams.get("to");
    if (to) {
      setRecipient(to);
      // Auto-resolve if it looks like a domain
      if (to.includes(".") && !to.startsWith("0x")) {
        handleResolve(to);
      }
    }
  }, [searchParams, handleResolve]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Update suggestions when recipient changes
  const updateSuggestions = useCallback((input: string) => {
    if (!input.trim()) {
      // Show all recent lookups when input is empty but focused
      setSuggestions(getSavedLookups());
    } else {
      // Filter by input
      const filtered = getSavedLookups().filter(
        (l) => l.fqdn.toLowerCase().includes(input.toLowerCase())
      );
      setSuggestions(filtered);
    }
  }, []);

  // Select a suggestion
  const selectSuggestion = (lookup: SavedLookup) => {
    setRecipient(lookup.fqdn);
    setShowSuggestions(false);
    handleResolve(lookup.fqdn);
  };

  // Validate amount
  const validateAmount = (): string | null => {
    if (!amount || parseFloat(amount) <= 0) {
      return "Please enter a valid amount";
    }

    if (!balance) {
      return "Unable to check balance";
    }

    const amountNum = parseFloat(amount);
    const balanceNum = parseFloat(balance);
    const gasBuffer = 0.01; // Reserve for gas

    if (amountNum > balanceNum - gasBuffer) {
      return "Insufficient balance";
    }

    return null;
  };

  // Check if ready to send
  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: derive ready state from amount validation */
  useEffect(() => {
    if (state === "resolved" && amount && !validateAmount()) {
      setState("ready");
    } else if (state === "ready" && (!amount || validateAmount())) {
      setState("resolved");
    }
  }, [amount, state, balance]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Send transaction
  const handleSend = async () => {
    if (!walletProvider || !resolvedData?.address) return;

    const validationError = validateAmount();
    if (validationError) {
      setError(validationError);
      return;
    }

    setState("sending");
    setError(null);
    setTxHash(null);

    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();

      const txParams: { to: string; value: bigint; data?: string } = {
        to: resolvedData.address,
        value: parseEther(amount),
      };

      // Add note as data if provided
      if (note.trim()) {
        txParams.data = hexlify(toUtf8Bytes(note.trim()));
      }

      const tx = await signer.sendTransaction(txParams);

      setTxHash(tx.hash);

      // Wait for confirmation
      await tx.wait();

      setState("success");

      // Refresh balance
      loadBalance();
    } catch (err: unknown) {
      console.error("Transaction failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Transaction failed";
      if (errorMessage.includes("rejected") || errorMessage.includes("denied")) {
        setError("Transaction was rejected");
      } else {
        setError(errorMessage);
      }
      setState("error");
    }
  };

  // Reset form
  const handleReset = () => {
    setRecipient("");
    setAmount("");
    setNote("");
    setResolvedData(null);
    setState("idle");
    setError(null);
    setTxHash(null);
  };

  // Get source label for display
  const getSourceLabel = (source: string): string => {
    switch (source) {
      case "on-chain":
        return "On-chain";
      case "database":
        return "Database";
      case "owner":
        return "Owner";
      default:
        return source;
    }
  };

  // Derive current step from state
  const currentStep = useMemo(() => {
    switch (state) {
      case "idle":
      case "resolving":
      case "error":
        return 0;
      case "resolved":
        return 1;
      case "ready":
        return 2;
      case "sending":
        return 2;
      case "success":
        return 3;
      default:
        return 0;
    }
  }, [state]);

  // Quick amount buttons
  const quickAmounts = useMemo(() => {
    if (!balance) return [];
    const bal = parseFloat(balance);
    const gasBuffer = 0.01;
    const maxSend = Math.max(0, bal - gasBuffer);
    return [
      { label: "25%", value: (maxSend * 0.25).toFixed(6) },
      { label: "50%", value: (maxSend * 0.5).toFixed(6) },
      { label: "75%", value: (maxSend * 0.75).toFixed(6) },
      { label: "MAX", value: maxSend.toFixed(6) },
    ];
  }, [balance]);

  // ─── Not Connected ───
  if (!isConnected) {
    return (
      <>
        <style>{`
          @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
          @keyframes glow-ring { 0%, 100% { box-shadow: 0 0 20px hsl(var(--primary) / 0.2), inset 0 0 20px hsl(var(--primary) / 0.05); } 50% { box-shadow: 0 0 40px hsl(var(--primary) / 0.4), inset 0 0 30px hsl(var(--primary) / 0.1); } }
        `}</style>
        <CircuitBackground />
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 relative" style={{ zIndex: 1 }}>
          <div className="relative w-full max-w-md">
            {/* Ambient glow */}
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-transparent to-emerald-500/20 rounded-3xl blur-3xl opacity-40" />

            <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950/90 backdrop-blur-xl p-10 text-center overflow-hidden">
              {/* Decorative gradient line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />

              <div
                className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"
                style={{ animation: "float 3s ease-in-out infinite" }}
              >
                <Wallet className="h-9 w-9 text-primary" />
              </div>

              <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                Connect Your Wallet
              </h2>
              <p className="text-zinc-500 mb-8 text-sm">
                Connect your wallet to send {currencySymbol} to any Handshake domain
              </p>

              <button
                onClick={() => open()}
                className="w-full py-3 px-6 rounded-xl font-semibold text-sm bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-500 text-white transition-all duration-300 hover:shadow-[0_0_30px_hsl(var(--primary)/0.4)] active:scale-[0.98]"
                style={{ animation: "glow-ring 3s ease-in-out infinite" }}
              >
                Connect Wallet
              </button>

              <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-zinc-600">
                <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Secure</span>
                <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> Instant</span>
                <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> Decentralized</span>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ─── Main Send Page ───
  return (
    <>
      <style>{`
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scale-in { from { transform: scale(0); } to { transform: scale(1); } }
        @keyframes draw-check { to { stroke-dashoffset: 0; } }
        @keyframes confetti-fall { 0% { opacity: 1; transform: translateY(0) rotate(0deg); } 100% { opacity: 0; transform: translateY(320px) rotate(720deg); } }
        @keyframes glow-pulse { 0%, 100% { box-shadow: 0 0 20px hsl(var(--primary) / 0.15); } 50% { box-shadow: 0 0 40px hsl(var(--primary) / 0.35); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes resolve-pulse { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
        .animate-fade-in-up { animation: fade-in-up 0.5s ease-out forwards; }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
      `}</style>

      <CircuitBackground />
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8 relative" style={{ zIndex: 1 }}>
        <div className="relative w-full max-w-lg">
          {/* Background ambient glow */}
          <div
            className={`absolute -inset-8 rounded-3xl blur-3xl transition-all duration-1000 ${
              state === "success"
                ? "bg-gradient-to-r from-emerald-500/20 via-transparent to-emerald-500/20 opacity-60"
                : state === "sending"
                  ? "bg-gradient-to-r from-primary/20 via-transparent to-primary/20 opacity-60"
                  : "bg-gradient-to-r from-primary/10 via-transparent to-emerald-500/10 opacity-40"
            }`}
            style={state === "sending" ? { animation: "glow-pulse 2s ease-in-out infinite" } : undefined}
          />

          {/* Main card */}
          <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950/90 backdrop-blur-xl overflow-hidden">
            {/* Top gradient accent */}
            <div
              className={`h-[2px] transition-all duration-700 ${
                state === "success"
                  ? "bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
                  : state === "sending"
                    ? "bg-gradient-to-r from-transparent via-primary to-transparent"
                    : "bg-gradient-to-r from-transparent via-primary/80 to-transparent"
              }`}
              style={state === "sending" ? {
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s linear infinite",
                backgroundImage: "linear-gradient(90deg, transparent, hsl(var(--primary)), transparent, hsl(var(--primary)), transparent)",
              } : undefined}
            />

            <div className="p-6 sm:p-8">
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-indigo-600/20 border border-primary/30 flex items-center justify-center">
                    <Send className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                      Send {currencySymbol}
                    </h1>
                    <p className="text-xs text-zinc-500">
                      To any domain or address
                    </p>
                  </div>
                </div>
                {balance && state !== "success" && (
                  <div className="text-right">
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">Balance</p>
                    <p className="text-sm font-mono font-semibold text-zinc-300">
                      {parseFloat(balance).toFixed(4)} <span className="text-zinc-500 text-xs">{currencySymbol}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Step Indicator */}
              <StepIndicator currentStep={currentStep} />

              {/* ─── Success State ─── */}
              {state === "success" && (
                <div className="text-center py-4 animate-fade-in-up relative">
                  {/* Confetti */}
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {Array.from({ length: 30 }, (_, i) => (
                      <ConfettiPiece key={i} index={i} />
                    ))}
                  </div>

                  <div className="relative z-10">
                    <div className="flex justify-center mb-4">
                      <AnimatedCheck />
                    </div>

                    <h3 className="text-2xl font-bold mb-1 bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
                      Transaction Sent!
                    </h3>

                    <div className="mt-4 mb-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4">
                      <div className="flex items-center justify-center gap-2 text-emerald-400 mb-2">
                        <Sparkles className="h-4 w-4" />
                        <span className="text-lg font-bold font-mono">{amount} {currencySymbol}</span>
                      </div>
                      <p className="text-sm text-zinc-400">
                        sent to{" "}
                        {resolvedData?.fqdn && !isHexAddress(resolvedData.fqdn) ? (
                          <span className="font-mono text-emerald-400 font-medium">{resolvedData.fqdn}</span>
                        ) : (
                          <span className="font-mono text-zinc-300">{resolvedData?.address?.slice(0, 10)}...{resolvedData?.address?.slice(-6)}</span>
                        )}
                      </p>
                      {note && (
                        <p className="text-xs text-zinc-500 mt-2 italic">
                          &quot;{note}&quot;
                        </p>
                      )}
                    </div>

                    {txHash && (
                      <a
                        href={`https://coston2-explorer.flare.network/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors mb-6 group"
                      >
                        View on Explorer
                        <ExternalLink className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </a>
                    )}

                    <div className="pt-4">
                      <button
                        onClick={handleReset}
                        className="px-6 py-2.5 rounded-xl border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900 hover:border-zinc-700 transition-all duration-200"
                      >
                        Send Another
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Main Form ─── */}
              {state !== "success" && (
                <div className="space-y-5">
                  {/* Recipient Input */}
                  <div className="animate-fade-in-up" style={{ opacity: 0, animationFillMode: "forwards" }}>
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 block">
                      Recipient
                    </label>
                    <div className="relative">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                          <Input
                            ref={inputRef}
                            placeholder="gym.sexyness or 0x..."
                            value={recipient}
                            onChange={(e) => {
                              setRecipient(e.target.value);
                              setResolvedData(null);
                              setState("idle");
                              setError(null);
                              updateSuggestions(e.target.value);
                              setShowSuggestions(true);
                            }}
                            onFocus={() => {
                              updateSuggestions(recipient);
                              setShowSuggestions(true);
                            }}
                            onBlur={() => {
                              // Delay hiding to allow click on suggestion
                              setTimeout(() => setShowSuggestions(false), 200);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleResolve();
                            }}
                            className="pl-10 font-mono bg-zinc-900/50 border-zinc-800 h-11 focus:border-primary/50"
                            disabled={state === "sending"}
                            autoComplete="off"
                          />
                        </div>
                        <button
                          onClick={() => handleResolve()}
                          disabled={!recipient.trim() || state === "resolving" || state === "sending"}
                          className="h-11 px-4 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-primary hover:border-primary/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
                        >
                          {state === "resolving" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      {/* Resolving indicator */}
                      {state === "resolving" && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-primary" style={{ animation: "resolve-pulse 1.5s ease-in-out infinite" }}>
                          <Globe className="h-4 w-4 animate-spin" />
                          <span>Resolving domain...</span>
                        </div>
                      )}

                      {/* Suggestions Dropdown */}
                      {showSuggestions && suggestions.length > 0 && !resolvedData && (
                        <div className="absolute z-10 w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl shadow-black/50 max-h-48 overflow-y-auto">
                          <div className="px-3 py-2 text-[10px] text-zinc-600 border-b border-zinc-800 flex items-center gap-1 uppercase tracking-wider font-medium">
                            <Clock className="h-3 w-3" />
                            Recent
                          </div>
                          {suggestions.map((lookup) => (
                            <button
                              key={lookup.fqdn}
                              type="button"
                              className="w-full px-3 py-2.5 text-left hover:bg-zinc-800/50 transition-colors flex items-center justify-between group"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectSuggestion(lookup);
                              }}
                            >
                              <span className="font-mono text-sm text-zinc-300 group-hover:text-white transition-colors">{lookup.fqdn}</span>
                              <span className="text-xs text-zinc-600 font-mono">
                                {lookup.address.slice(0, 6)}...{lookup.address.slice(-4)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-1.5">
                      Enter a domain name or Flare wallet address
                    </p>
                  </div>

                  {/* Resolved Address Display */}
                  {resolvedData && (state === "resolved" || state === "ready" || state === "sending") && (
                    <div className="animate-fade-in-up rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4" style={{ opacity: 0, animationFillMode: "forwards" }}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                          <Check className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Resolved</span>
                            {resolvedData.source && !isHexAddress(recipient) && (
                              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 h-5">
                                {getSourceLabel(resolvedData.source)}
                              </Badge>
                            )}
                          </div>
                          {!isHexAddress(recipient) && (
                            <div className="text-sm text-zinc-400 mb-0.5 font-medium">
                              {resolvedData.fqdn}
                            </div>
                          )}
                          <div className="font-mono text-xs text-zinc-500 break-all">
                            {resolvedData.address}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Amount Input */}
                  {resolvedData && (state === "resolved" || state === "ready" || state === "sending") && (
                    <div className="animate-fade-in-up delay-100" style={{ opacity: 0, animationFillMode: "forwards" }}>
                      <div className="flex justify-between items-end mb-2">
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                          Amount
                        </label>
                        {balance && (
                          <span className="text-[11px] text-zinc-600 font-mono">
                            Available: {parseFloat(balance).toFixed(4)} {currencySymbol}
                          </span>
                        )}
                      </div>

                      <div className="relative">
                        <Input
                          type="number"
                          placeholder="0.0"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="pr-20 text-lg font-mono h-14 bg-zinc-900/50 border-zinc-800 focus:border-primary/50"
                          step="0.0001"
                          min="0"
                          disabled={state === "sending"}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-zinc-500">
                          {currencySymbol}
                        </span>
                      </div>

                      {/* Quick amount buttons */}
                      {quickAmounts.length > 0 && (
                        <div className="flex gap-2 mt-2">
                          {quickAmounts.map((qa) => (
                            <button
                              key={qa.label}
                              type="button"
                              onClick={() => setAmount(qa.value)}
                              disabled={state === "sending"}
                              className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider border transition-all duration-200 disabled:opacity-30 ${
                                qa.label === "MAX"
                                  ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                                  : "bg-zinc-900/50 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                              }`}
                            >
                              {qa.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {amount && validateAmount() && (
                        <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {validateAmount()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Note Input (Optional) */}
                  {resolvedData && (state === "resolved" || state === "ready" || state === "sending") && (
                    <div className="animate-fade-in-up delay-200" style={{ opacity: 0, animationFillMode: "forwards" }}>
                      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <MessageSquare className="h-3 w-3" />
                        Note <span className="text-zinc-600 normal-case tracking-normal font-normal">(optional)</span>
                      </label>
                      <Input
                        placeholder="Add a message to this transaction..."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={256}
                        disabled={state === "sending"}
                        className="bg-zinc-900/50 border-zinc-800 h-11 focus:border-primary/50"
                      />
                      <div className="flex justify-between mt-1.5">
                        <p className="text-[11px] text-zinc-600">
                          Stored on-chain, visible on explorer
                        </p>
                        <p className="text-[11px] text-zinc-600 font-mono">
                          {note.length}/256
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Error Display */}
                  {error && (
                    <div className="animate-fade-in-up rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                          <AlertCircle className="h-4 w-4 text-red-400" />
                        </div>
                        <span className="text-sm text-red-400">{error}</span>
                      </div>
                    </div>
                  )}

                  {/* Send Button */}
                  {resolvedData && (
                    <div className="animate-fade-in-up delay-300 pt-2" style={{ opacity: 0, animationFillMode: "forwards" }}>
                      <button
                        onClick={handleSend}
                        disabled={state !== "ready" || !amount || !!validateAmount()}
                        className={`
                          w-full py-4 rounded-xl font-semibold text-sm transition-all duration-300 relative overflow-hidden
                          ${state === "sending"
                            ? "bg-primary/20 border border-primary/30 text-primary cursor-wait"
                            : state === "ready"
                              ? "bg-gradient-to-r from-primary to-indigo-600 text-white hover:shadow-[0_0_30px_hsl(var(--primary)/0.4)] active:scale-[0.98] hover:from-primary/90 hover:to-indigo-500"
                              : "bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed"
                          }
                        `}
                        style={state === "sending" ? { animation: "glow-pulse 1.5s ease-in-out infinite" } : undefined}
                      >
                        {state === "sending" ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending Transaction...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Send className="h-4 w-4" />
                            Send {amount || "0"} {currencySymbol}
                            <ArrowRight className="h-4 w-4" />
                          </span>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Idle state hint */}
                  {state === "idle" && !resolvedData && (
                    <div className="text-center pt-6 pb-2">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                        <Search className="h-5 w-5 text-zinc-600" />
                      </div>
                      <p className="text-sm text-zinc-500">
                        Enter a domain name or Flare wallet address to get started
                      </p>
                      <p className="text-[11px] text-zinc-700 mt-1">
                        Press Enter or click the search icon to resolve
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom decoration */}
            <div className="h-[1px] bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
          </div>
        </div>
      </div>
    </>
  );
}
