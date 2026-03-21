"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Eye, ShoppingCart, DollarSign, Globe, TrendingUp, TrendingDown,
  Smartphone, Monitor, Tablet, ArrowUpRight,
  ArrowDownRight, Users, Target, MousePointer, BarChart3, PieChart as PieChartIcon,
  Zap, Clock, ChevronDown, ChevronUp, X, Wallet, MousePointerClick, UserPlus, Percent, Link2, Sparkles,
  Music, Twitter, Facebook, Github, MessageCircle,
  Calendar, FileText, Image, Mail, ExternalLink, Download, ShoppingBag,
  Video, Headphones, Mic, Heart, Star, Gift, Ticket, Coffee, Pizza, UtensilsCrossed,
  Send, Hash, Camera, Play, Radio, Gamepad2, BookOpen, Rocket, DollarSign as Dollar
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, ReferenceLine
} from "recharts"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/i18n"
import { triggerHaptic } from "@/lib/native-bridge"
import { AnnouncementBarMobile } from "@/components/app/announcement-bar-mobile"

// Custom Spotify Icon (brand SVG)
const SpotifyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 20 20" className={className} fill="currentColor">
    <path d="M10 0C4.477 0 0 4.477 0 10s4.477 10 10 10 10-4.477 10-10S15.523 0 10 0zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 11-.277-1.214c3.808-.87 7.076-.496 9.712 1.115a.622.622 0 01.207.856zm1.224-2.719a.778.778 0 01-1.07.256c-2.687-1.652-6.785-2.131-9.965-1.166a.778.778 0 01-.452-1.49c3.632-1.102 8.147-.568 11.234 1.328a.778.778 0 01.253 1.072zm.105-2.835c-3.223-1.914-8.54-2.09-11.618-1.156a.933.933 0 11-.542-1.785c3.532-1.072 9.404-.865 13.115 1.338a.933.933 0 01-.955 1.603z"/>
  </svg>
)

// Custom YouTube Icon (brand SVG)
const YoutubeIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 48 34" className={className} fill="#FF0000">
    <path d="M47.52 7.334s-.47-3.33-1.908-4.797C43.786 .61 41.74.6 40.803.49 34.086 0 24.01 0 24.01 0h-.02S13.914 0 7.197.49C6.258.6 4.214.61 2.387 2.537.948 4.004.48 7.334.48 7.334S0 11.247 0 15.158v3.668c0 3.912.48 7.823.48 7.823s.47 3.331 1.908 4.798c1.826 1.926 4.224 1.865 5.292 2.066C11.52 33.885 24 34 24 34s10.086-.016 16.803-.505c.94-.112 2.984-.122 4.81-2.048 1.438-1.467 1.907-4.797 1.907-4.797s.48-3.911.48-7.823v-3.668c0-3.911-.48-7.824-.48-7.824zM19.044 23.27V10.687l12.967 6.315-12.967 6.27z"/>
  </svg>
)

// Custom TikTok Icon (brand SVG)
const TiktokIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} fill="currentColor">
    <path d="M16.656 1.029c1.637-0.025 3.262-0.012 4.886-0.025 0.054 2.031 0.878 3.859 2.189 5.213l-0.002-0.002c1.411 1.271 3.247 2.095 5.271 2.235l0.028 0.002v5.036c-1.912-0.048-3.71-0.489-5.331-1.247l0.082 0.034c-0.784-0.377-1.447-0.764-2.077-1.196l0.052 0.034c-0.012 3.649 0.012 7.298-0.025 10.934-0.103 1.853-0.719 3.543-1.707 4.954l0.020-0.031c-1.652 2.366-4.328 3.919-7.371 4.011l-0.014 0c-0.123 0.006-0.268 0.009-0.414 0.009-1.73 0-3.347-0.482-4.725-1.319l0.040 0.023c-2.508-1.509-4.238-4.091-4.558-7.094l-0.004-0.041c-0.025-0.625-0.037-1.25-0.012-1.862 0.49-4.779 4.494-8.476 9.361-8.476 0.547 0 1.083 0.047 1.604 0.136l-0.056-0.008c0.025 1.849-0.050 3.699-0.050 5.548-0.423-0.153-0.911-0.242-1.42-0.242-1.868 0-3.457 1.194-4.045 2.861l-0.009 0.030c-0.133 0.427-0.21 0.918-0.21 1.426 0 0.206 0.013 0.41 0.037 0.61l-0.002-0.024c0.332 2.046 2.086 3.59 4.201 3.59 0.061 0 0.121-0.001 0.181-0.004l-0.009 0c1.463-0.044 2.733-0.831 3.451-1.994l0.010-0.018c0.267-0.372 0.45-0.822 0.511-1.311l0.001-0.014c0.125-2.237 0.075-4.461 0.087-6.698 0.012-5.036-0.012-10.060 0.025-15.083z"/>
  </svg>
)

// Custom WhatsApp Icon (brand SVG)
const WhatsappIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className}>
    <path fill="#25D366" d="M17,0C8.7,0,2,6.7,2,15c0,3.4,1.1,6.6,3.2,9.2l-2.1,6.4c-0.1,0.4,0,0.8,0.3,1.1C3.5,31.9,3.8,32,4,32 c0.1,0,0.3,0,0.4-0.1l6.9-3.1C13.1,29.6,15,30,17,30c8.3,0,15-6.7,15-15S25.3,0,17,0z"/>
    <path fill="#FFFFFF" d="M25.7,20.5c-0.4,1.2-1.9,2.2-3.2,2.4C22.2,23,21.9,23,21.5,23c-0.8,0-2-0.2-4.1-1.1c-2.4-1-4.8-3.1-6.7-5.8 L10.7,16C10.1,15.1,9,13.4,9,11.6c0-2.2,1.1-3.3,1.5-3.8c0.5-0.5,1.2-0.8,2-0.8c0.2,0,0.3,0,0.5,0c0.7,0,1.2,0.2,1.7,1.2l0.4,0.8 c0.3,0.8,0.7,1.7,0.8,1.8c0.3,0.6,0.3,1.1,0,1.6c-0.1,0.3-0.3,0.5-0.5,0.7c-0.1,0.2-0.2,0.3-0.3,0.3c-0.1,0.1-0.1,0.1-0.2,0.2 c0.3,0.5,0.9,1.4,1.7,2.1c1.2,1.1,2.1,1.4,2.6,1.6l0,0c0.2-0.2,0.4-0.6,0.7-0.9l0.1-0.2c0.5-0.7,1.3-0.9,2.1-0.6 c0.4,0.2,2.6,1.2,2.6,1.2l0.2,0.1c0.3,0.2,0.7,0.3,0.9,0.7C26.2,18.5,25.9,19.8,25.7,20.5z"/>
  </svg>
)

// Custom Notion Icon (brand SVG)
const NotionIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none">
    <path fillRule="evenodd" clipRule="evenodd" d="M5.716 29.2178L2.27664 24.9331C1.44913 23.9023 1 22.6346 1 21.3299V5.81499C1 3.86064 2.56359 2.23897 4.58071 2.10125L20.5321 1.01218C21.691 0.933062 22.8428 1.24109 23.7948 1.8847L29.3992 5.67391C30.4025 6.35219 31 7.46099 31 8.64426V26.2832C31 28.1958 29.4626 29.7793 27.4876 29.9009L9.78333 30.9907C8.20733 31.0877 6.68399 30.4237 5.716 29.2178Z" fill="white"/>
    <path d="M11.2481 13.5787V13.3756C11.2481 12.8607 11.6605 12.4337 12.192 12.3982L16.0633 12.1397L21.417 20.0235V13.1041L20.039 12.9204V12.824C20.039 12.303 20.4608 11.8732 20.9991 11.8456L24.5216 11.6652V12.1721C24.5216 12.41 24.3446 12.6136 24.1021 12.6546L23.2544 12.798V24.0037L22.1906 24.3695C21.3018 24.6752 20.3124 24.348 19.8036 23.5803L14.6061 15.7372V23.223L16.2058 23.5291L16.1836 23.6775C16.1137 24.1423 15.7124 24.4939 15.227 24.5155L11.2481 24.6926C11.1955 24.1927 11.5701 23.7456 12.0869 23.6913L12.6103 23.6363V13.6552L11.2481 13.5787Z" fill="#000000"/>
    <path fillRule="evenodd" clipRule="evenodd" d="M20.6749 2.96678L4.72347 4.05585C3.76799 4.12109 3.02734 4.88925 3.02734 5.81499V21.3299C3.02734 22.1997 3.32676 23.0448 3.87843 23.7321L7.3178 28.0167C7.87388 28.7094 8.74899 29.0909 9.65435 29.0352L27.3586 27.9454C28.266 27.8895 28.9724 27.1619 28.9724 26.2832V8.64426C28.9724 8.10059 28.6979 7.59115 28.2369 7.27951L22.6325 3.49029C22.0613 3.10413 21.3702 2.91931 20.6749 2.96678ZM5.51447 6.057C5.29261 5.89274 5.3982 5.55055 5.6769 5.53056L20.7822 4.44711C21.2635 4.41259 21.7417 4.54512 22.1309 4.82088L25.1617 6.96813C25.2767 7.04965 25.2228 7.22563 25.0803 7.23338L9.08387 8.10336C8.59977 8.12969 8.12193 7.98747 7.73701 7.7025L5.51447 6.057ZM8.33357 10.8307C8.33357 10.311 8.75341 9.88177 9.29027 9.85253L26.203 8.93145C26.7263 8.90296 27.1667 9.30534 27.1667 9.81182V25.0853C27.1667 25.604 26.7484 26.0328 26.2126 26.0633L9.40688 27.0195C8.8246 27.0527 8.33357 26.6052 8.33357 26.0415V10.8307Z" fill="#000000"/>
  </svg>
)

// Custom Apple Music Icon (brand SVG)
const AppleMusicIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="m24 6.124c0-.029.001-.063.001-.097 0-.743-.088-1.465-.253-2.156l.013.063c-.312-1.291-1.1-2.359-2.163-3.031l-.02-.012c-.536-.35-1.168-.604-1.847-.723l-.03-.004c-.463-.084-1.003-.138-1.553-.15h-.011c-.04 0-.083-.01-.124-.013h-12.025c-.152.01-.3.017-.455.026-.791.016-1.542.161-2.242.415l.049-.015c-1.306.501-2.327 1.495-2.853 2.748l-.012.033c-.17.409-.297.885-.36 1.38l-.003.028c-.051.343-.087.751-.1 1.165v.016c0 .032-.007.062-.01.093v12.224c.01.14.017.283.027.424.02.861.202 1.673.516 2.416l-.016-.043c.609 1.364 1.774 2.387 3.199 2.792l.035.009c.377.111.817.192 1.271.227l.022.001c.555.053 1.11.06 1.667.06h11.028c.554 0 1.099-.037 1.633-.107l-.063.007c.864-.096 1.645-.385 2.321-.823l-.021.013c.825-.539 1.47-1.29 1.867-2.176l.013-.032c.166-.383.295-.829.366-1.293l.004-.031c.084-.539.132-1.161.132-1.794 0-.086-.001-.171-.003-.256v.013q0-5.7 0-11.394zm-6.424 3.99v5.712c.001.025.001.054.001.083 0 .407-.09.794-.252 1.14l.007-.017c-.273.562-.771.979-1.373 1.137l-.015.003c-.316.094-.682.156-1.06.173h-.01c-.029.002-.062.002-.096.002-1.033 0-1.871-.838-1.871-1.871 0-.741.431-1.382 1.056-1.685l.011-.005c.293-.14.635-.252.991-.32l.027-.004c.378-.082.758-.153 1.134-.24.264-.045.468-.252.51-.513v-.003c.013-.057.02-.122.02-.189 0-.002 0-.003 0-.005q0-2.723 0-5.443c-.001-.066-.01-.13-.027-.19l.001.005c-.026-.134-.143-.235-.283-.235-.006 0-.012 0-.018.001h.001c-.178.013-.34.036-.499.07l.024-.004q-1.14.225-2.28.456l-3.7.748c-.016 0-.032.01-.048.013-.222.03-.392.219-.392.447 0 .015.001.03.002.045v-.002.13q0 3.9 0 7.801c.001.028.001.062.001.095 0 .408-.079.797-.224 1.152l.007-.021c-.264.614-.792 1.072-1.436 1.235l-.015.003c-.319.096-.687.158-1.067.172h-.008c-.031.002-.067.003-.104.003-.913 0-1.67-.665-1.815-1.536l-.001-.011c-.02-.102-.031-.218-.031-.338 0-.785.485-1.458 1.172-1.733l.013-.004c.315-.127.687-.234 1.072-.305l.036-.005c.287-.06.575-.116.86-.177.341-.05.6-.341.6-.693 0-.007 0-.015 0-.022v.001-.15q0-4.44 0-8.883c0-.002 0-.004 0-.007 0-.129.015-.254.044-.374l-.002.011c.066-.264.277-.466.542-.517l.004-.001c.255-.066.515-.112.774-.165.733-.15 1.466-.3 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.4.181-.042.407-.079.637-.104l.027-.002c.018-.002.04-.004.061-.004.27 0 .489.217.493.485.008.067.012.144.012.222v.001q0 2.865 0 5.732z"/>
  </svg>
)

// Custom LinkedIn Icon (brand SVG)
const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg viewBox="-143 145 512 512" className={className}>
    <path fill="#0A66C2" d="M113,145c-141.4,0-256,114.6-256,256s114.6,256,256,256s256-114.6,256-256S254.4,145,113,145z M41.4,508.1H-8.5V348.4h49.9 V508.1z M15.1,328.4h-0.4c-18.1,0-29.8-12.2-29.8-27.7c0-15.8,12.1-27.7,30.5-27.7c18.4,0,29.7,11.9,30.1,27.7 C45.6,316.1,33.9,328.4,15.1,328.4z M241,508.1h-56.6v-82.6c0-21.6-8.8-36.4-28.3-36.4c-14.9,0-23.2,10-27,19.6 c-1.4,3.4-1.2,8.2-1.2,13.1v86.3H71.8c0,0,0.7-146.4,0-159.7h56.1v25.1c3.3-11,21.2-26.6,49.8-26.6c35.5,0,63.3,23,63.3,72.4V508.1z"/>
  </svg>
)

// Custom Instagram Icon (brand SVG with gradients)
const InstagramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none">
    <defs>
      <radialGradient id="igGrad1" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(12 23) rotate(-55.3758) scale(25.5196)">
        <stop stopColor="#B13589"/>
        <stop offset="0.79309" stopColor="#C62F94"/>
        <stop offset="1" stopColor="#8A3AC8"/>
      </radialGradient>
      <radialGradient id="igGrad2" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(11 31) rotate(-65.1363) scale(22.5942)">
        <stop stopColor="#E0E8B7"/>
        <stop offset="0.444662" stopColor="#FB8A2E"/>
        <stop offset="0.71474" stopColor="#E2425C"/>
        <stop offset="1" stopColor="#E2425C" stopOpacity="0"/>
      </radialGradient>
      <radialGradient id="igGrad3" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(0.500002 3) rotate(-8.1301) scale(38.8909 8.31836)">
        <stop offset="0.156701" stopColor="#406ADC"/>
        <stop offset="0.467799" stopColor="#6A45BE"/>
        <stop offset="1" stopColor="#6A45BE" stopOpacity="0"/>
      </radialGradient>
    </defs>
    <rect x="2" y="2" width="28" height="28" rx="6" fill="url(#igGrad1)"/>
    <rect x="2" y="2" width="28" height="28" rx="6" fill="url(#igGrad2)"/>
    <rect x="2" y="2" width="28" height="28" rx="6" fill="url(#igGrad3)"/>
    <path d="M23 10.5C23 11.3284 22.3284 12 21.5 12C20.6716 12 20 11.3284 20 10.5C20 9.67157 20.6716 9 21.5 9C22.3284 9 23 9.67157 23 10.5Z" fill="white"/>
    <path fillRule="evenodd" clipRule="evenodd" d="M16 21C18.7614 21 21 18.7614 21 16C21 13.2386 18.7614 11 16 11C13.2386 11 11 13.2386 11 16C11 18.7614 13.2386 21 16 21ZM16 19C17.6569 19 19 17.6569 19 16C19 14.3431 17.6569 13 16 13C14.3431 13 13 14.3431 13 16C13 17.6569 14.3431 19 16 19Z" fill="white"/>
    <path fillRule="evenodd" clipRule="evenodd" d="M6 15.6C6 12.2397 6 10.5595 6.65396 9.27606C7.2292 8.14708 8.14708 7.2292 9.27606 6.65396C10.5595 6 12.2397 6 15.6 6H16.4C19.7603 6 21.4405 6 22.7239 6.65396C23.8529 7.2292 24.7708 8.14708 25.346 9.27606C26 10.5595 26 12.2397 26 15.6V16.4C26 19.7603 26 21.4405 25.346 22.7239C24.7708 23.8529 23.8529 24.7708 22.7239 25.346C21.4405 26 19.7603 26 16.4 26H15.6C12.2397 26 10.5595 26 9.27606 25.346C8.14708 24.7708 7.2292 23.8529 6.65396 22.7239C6 21.4405 6 19.7603 6 16.4V15.6ZM15.6 8H16.4C18.1132 8 19.2777 8.00156 20.1779 8.0751C21.0548 8.14674 21.5032 8.27659 21.816 8.43597C22.5686 8.81947 23.1805 9.43139 23.564 10.184C23.7234 10.4968 23.8533 10.9452 23.9249 11.8221C23.9984 12.7223 24 13.8868 24 15.6V16.4C24 18.1132 23.9984 19.2777 23.9249 20.1779C23.8533 21.0548 23.7234 21.5032 23.564 21.816C23.1805 22.5686 22.5686 23.1805 21.816 23.564C21.5032 23.7234 21.0548 23.8533 20.1779 23.9249C19.2777 23.9984 18.1132 24 16.4 24H15.6C13.8868 24 12.7223 23.9984 11.8221 23.9249C10.9452 23.8533 10.4968 23.7234 10.184 23.564C9.43139 23.1805 8.81947 22.5686 8.43597 21.816C8.27659 21.5032 8.14674 21.0548 8.0751 20.1779C8.00156 19.2777 8 18.1132 8 16.4V15.6C8 13.8868 8.00156 12.7223 8.0751 11.8221C8.14674 10.9452 8.27659 10.4968 8.43597 10.184C8.81947 9.43139 9.43139 8.81947 10.184 8.43597C10.4968 8.27659 10.9452 8.14674 11.8221 8.0751C12.7223 8.00156 13.8868 8 15.6 8Z" fill="white"/>
  </svg>
)

// Custom Apple Icon (brand SVG)
const AppleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
)

interface Product {
  id: string
  title: string
  thumbnail_url?: string | null
}

interface Order {
  id: string
  product_id: string
  amount_cents: number
  status: string
  created_at: string
  product?: {
    id: string
    title: string
  } | null
}

interface AnalyticsClientProps {
  creatorId: string
  userId: string
  products: Product[]
  initialOrders: Order[]
}

interface Summary {
  totalViews: number
  totalOrders: number
  totalRevenue: number
  conversionRate: number
  avgOrderValue: number
  uniqueVisitors: number
  // Previous period for comparison
  prevPeriodViews: number
  prevPeriodOrders: number
  prevPeriodRevenue: number
  // All-time values
  allTimeViews: number
  allTimeOrders: number
  allTimeRevenue: number
}

interface TrendData {
  date: string
  views: number
  sales: number
  revenue: number
  clicks?: number
  subscribers?: number
  refunds?: number
}

interface TrafficSource {
  source: string
  views: number
  orders: number
  conversionRate: number
}

interface CountryData {
  code: string
  name: string
  views: number
  orders: number
  revenue: number
  conversionRate: number
}

interface DeviceData {
  device: string
  views: number
  orders: number
  conversionRate: number
}

interface MostClickedBlock {
  id: string
  label: string
  url: string
  clicks: number
  icon?: string | null
  thumbnail?: string | null
  blockType?: string | null
}

interface TopProductData {
  id: string
  title: string
  thumbnail_url: string | null
  views: number
  orders: number
  revenue: number
  conversionRate: number
}

interface ChartDataPoint {
  label: string
  value: number
}

type AnalyticsMode = "store" | "onepage"
type KPIType = "views" | "orders" | "revenue" | "conversion" | "clicks" | "subscribers" | "ctr" | null
type ChartMetricFilter = "all" | "views" | "orders" | "revenue" | "conversion"
type OnePageChartFilter = "all" | "views" | "clicks" | "subscribers" | "ctr"

type TimeframeOption = {
  value: string
  label: string
  shortLabel: string
  getDates: () => { start: Date; end: Date }
}

// ── Sample data for analytics chart ───────────────────────────────────────
const ANALYTICS_SAMPLE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const ANALYTICS_SAMPLE_TREND = ANALYTICS_SAMPLE_DAYS.map((d, i) => ({
  date: d,
  views:       [45, 78, 35, 92, 63, 88, 51][i],
  sales:       [2, 5, 1, 7, 3, 6, 4][i],
  revenue:     [1250, 3400, 900, 4500, 2500, 3800, 2000][i],
  clicks:      [12, 22, 9, 31, 18, 28, 15][i],
  subscribers: [1, 2, 0, 3, 1, 2, 1][i],
  refunds:     0,
  conversion:  0,
  ctr:         0,
}))
const ANALYTICS_SAMPLE_SUMMARY: Summary = {
  totalViews: 452, totalOrders: 28, totalRevenue: 34500,
  conversionRate: 6.2, avgOrderValue: 1232, uniqueVisitors: 310,
  prevPeriodViews: 380, prevPeriodOrders: 22, prevPeriodRevenue: 28900,
  allTimeViews: 1660, allTimeOrders: 95, allTimeRevenue: 125000,
}

const timeframeOptions: TimeframeOption[] = [
  {
    value: "today",
    label: "Today",
    shortLabel: "Today",
    getDates: () => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date()
      return { start, end }
    },
  },
  {
    value: "yesterday",
    label: "Yesterday",
    shortLabel: "Yesterday",
    getDates: () => {
      const start = new Date()
      start.setDate(start.getDate() - 1)
      start.setHours(0, 0, 0, 0)
      const end = new Date()
      end.setDate(end.getDate() - 1)
      end.setHours(23, 59, 59, 999)
      return { start, end }
    },
  },
  {
    value: "last_7_days",
    label: "Last 7 days",
    shortLabel: "7 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 7)
      return { start, end }
    },
  },
  {
    value: "last_30_days",
    label: "Last 30 days",
    shortLabel: "30 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      return { start, end }
    },
  },
  {
    value: "this_month",
    label: "This month",
    shortLabel: "This month",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      return { start, end }
    },
  },
  {
    value: "last_90_days",
    label: "Last 90 days",
    shortLabel: "90 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 90)
      return { start, end }
    },
  },
  {
    value: "last_year",
    label: "Last year",
    shortLabel: "Last year",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setFullYear(start.getFullYear() - 1)
      return { start, end }
    },
  },
  {
    value: "all_time",
    label: "All time",
    shortLabel: "All time",
    getDates: () => {
      const end = new Date()
      const start = new Date(2020, 0, 1)
      return { start, end }
    },
  },
  {
    value: "custom",
    label: "Custom range",
    shortLabel: "Custom",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 7)
      return { start, end }
    },
  },
]

// Chart colors - matching reference image
const CHART_COLORS = {
  views: "#8b5cf6",
  clicks: "#a78bfa",
  orders: "#8b5cf6",
  revenue: "#3b82f6",
  refunds: "#f59e0b",
}

const PIE_COLORS = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe", "#f5f3ff"]

// Helper function to calculate percentage change
const calculatePercentChange = (current: number, previous: number): { value: number; isPositive: boolean; isZero: boolean } => {
  if (previous === 0 && current === 0) return { value: 0, isPositive: true, isZero: true }
  if (previous === 0) return { value: 100, isPositive: true, isZero: false }
  const change = ((current - previous) / previous) * 100
  return { value: Math.abs(change), isPositive: change >= 0, isZero: change === 0 }
}

// Small percentage change indicator component
function PercentChangeIndicator({ current, previous }: { current: number; previous: number }) {
  const { value, isPositive, isZero } = calculatePercentChange(current, previous)

  if (isZero) return null

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium cursor-help ${
        isPositive ? "text-emerald-600" : "text-[#9ca3af]"
      }`}
      title={`${isPositive ? "+" : "-"}${Math.round(value)}% compared to previous period`}
    >
      {isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {Math.round(value)}%
    </span>
  )
}

// Helper function to normalize date to timezone-aware date string for consistent key generation
function getDateKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const tz = typeof window !== "undefined" ? localStorage.getItem("storelib_timezone") || undefined : undefined
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })
}

// Mobile Bottom Sheet for Timeframe selection
function AnalyticsTimeframeSheet({
  isOpen,
  onClose,
  options,
  selectedValue,
  onSelect,
}: {
  isOpen: boolean
  onClose: () => void
  options: TimeframeOption[]
  selectedValue: string
  onSelect: (value: string) => void
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef(0)
  const lastYRef = useRef(0)
  const lastTimeRef = useRef(0)
  const velocityRef = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
      document.documentElement.style.overscrollBehavior = 'none'
      document.body.style.overscrollBehavior = 'none'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDragY(0)
      }, 400)
      return () => clearTimeout(timer)
    }
    return () => {
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
    }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setIsDragging(false)
    setDragY(0)
    velocityRef.current = 0
    setTimeout(() => {
      onClose()
    }, 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const sheetElement = sheetRef.current
    if (!sheetElement) return
    const sheetRect = sheetElement.getBoundingClientRect()
    const touchYInSheet = touch.clientY - sheetRect.top
    if (touchYInSheet <= 0 || touchYInSheet <= 100) {
      startYRef.current = touch.clientY
      lastYRef.current = touch.clientY
      lastTimeRef.current = Date.now()
      velocityRef.current = 0
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startYRef.current
    if (diff > 0) {
      e.preventDefault()
      const now = Date.now()
      const dt = Math.max(1, now - lastTimeRef.current)
      velocityRef.current = (currentY - lastYRef.current) / dt
      lastYRef.current = currentY
      lastTimeRef.current = now
      const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
      setDragY(resisted)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 92 || velocityRef.current > 0.55) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  if (!isVisible) return null

  return (
    <div
      className="fixed inset-0 z-[100] md:hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        style={{
          opacity: isAnimating ? 1 : 0,
          transition: isDragging ? 'none' : 'opacity 400ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={handleClose}
      />
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating ? `translate3d(0, ${dragY}px, 0)` : "translate3d(0, 100%, 0)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      >
        <div className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none">
          <div className="h-[5px] w-10 rounded-full bg-gray-300" />
        </div>
        <div className="px-4 pb-4">
          <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-4">Select time period</h3>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto overscroll-contain">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onSelect(option.value)
                  handleClose()
                }}
                className={`w-full text-left px-4 py-3 rounded-xl text-[15px] font-medium transition-colors ${
                  selectedValue === option.value
                    ? "bg-[#f3f4f6] text-[#1a1a2e]"
                    : "text-[#374151] hover:bg-[#f9fafb] active:bg-[#f3f4f6]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

// Mobile Bottom Sheet for Products selection
function AnalyticsProductsSheet({
  isOpen,
  onClose,
  products,
  selectedProduct,
  onSelect,
}: {
  isOpen: boolean
  onClose: () => void
  products: Product[]
  selectedProduct: string
  onSelect: (value: string) => void
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef(0)
  const lastYRef = useRef(0)
  const lastTimeRef = useRef(0)
  const velocityRef = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
      document.documentElement.style.overscrollBehavior = 'none'
      document.body.style.overscrollBehavior = 'none'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDragY(0)
      }, 400)
      return () => clearTimeout(timer)
    }
    return () => {
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
    }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setIsDragging(false)
    setDragY(0)
    velocityRef.current = 0
    setTimeout(() => {
      onClose()
    }, 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const sheetElement = sheetRef.current
    if (!sheetElement) return
    const sheetRect = sheetElement.getBoundingClientRect()
    const touchYInSheet = touch.clientY - sheetRect.top
    if (touchYInSheet <= 0 || touchYInSheet <= 100) {
      startYRef.current = touch.clientY
      lastYRef.current = touch.clientY
      lastTimeRef.current = Date.now()
      velocityRef.current = 0
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startYRef.current
    if (diff > 0) {
      e.preventDefault()
      const now = Date.now()
      const dt = Math.max(1, now - lastTimeRef.current)
      velocityRef.current = (currentY - lastYRef.current) / dt
      lastYRef.current = currentY
      lastTimeRef.current = now
      const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
      setDragY(resisted)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 92 || velocityRef.current > 0.55) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  if (!isVisible) return null

  return (
    <div
      className="fixed inset-0 z-[100] md:hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        style={{
          opacity: isAnimating ? 1 : 0,
          transition: isDragging ? 'none' : 'opacity 400ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={handleClose}
      />
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating ? `translate3d(0, ${dragY}px, 0)` : "translate3d(0, 100%, 0)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      >
        <div className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none">
          <div className="h-[5px] w-10 rounded-full bg-gray-300" />
        </div>
        <div className="px-4 pb-4">
          <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-4">Select product</h3>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto overscroll-contain">
            <button
              onClick={() => {
                onSelect("all")
                handleClose()
              }}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-colors ${
                selectedProduct === "all"
                  ? "bg-[#f3f4f6] text-[#1a1a2e]"
                  : "text-[#374151] hover:bg-[#f9fafb] active:bg-[#f3f4f6]"
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-[#f3f4f6] flex items-center justify-center shrink-0">
                <span className="text-[14px]">📦</span>
              </div>
              All products
            </button>
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onSelect(p.id)
                  handleClose()
                }}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-colors ${
                  selectedProduct === p.id
                    ? "bg-[#f3f4f6] text-[#1a1a2e]"
                    : "text-[#374151] hover:bg-[#f9fafb] active:bg-[#f3f4f6]"
                }`}
              >
                {p.thumbnail_url ? (
                  <img src={p.thumbnail_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-[#f3f4f6] flex items-center justify-center shrink-0">
                    <span className="text-[14px]">📦</span>
                  </div>
                )}
                <span className="truncate">{p.title}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

export function AnalyticsClient({ creatorId, userId, products, initialOrders }: AnalyticsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLanguage()

  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [timeframe, setTimeframe] = useState("last_7_days")
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false)
  const [isProductsOpen, setIsProductsOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState("all")
  // Mobile bottom sheet states
  const [isTimeframeSheetOpen, setIsTimeframeSheetOpen] = useState(false)
  const [isProductsSheetOpen, setIsProductsSheetOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  // Long-press tooltip state for mobile chart
  const chartLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [chartTooltipActive, setChartTooltipActive] = useState(false)
  const chartTooltipActiveRef = useRef(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const chartTouchStartRef = useRef<{ x: number; y: number } | null>(null)
  const [chartActiveIndex, setChartActiveIndex] = useState<number | null>(null)
  const chartRafRef = useRef<number | null>(null)
  const [chartShouldAnimate, setChartShouldAnimate] = useState(true)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartTooltipRef = useRef<HTMLDivElement>(null)
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // Initialize analytics mode from URL param (?mode=onepage or ?mode=store)
  const initialMode = searchParams.get("mode") as AnalyticsMode | null
  const [analyticsMode, setAnalyticsModeState] = useState<AnalyticsMode>(initialMode === "onepage" ? "onepage" : "store")

  // Wrapper function to update both state and URL when mode changes
  const setAnalyticsMode = useCallback((mode: AnalyticsMode) => {
    setAnalyticsModeState(mode)
    // Update URL without full page reload
    const params = new URLSearchParams(searchParams.toString())
    params.set("mode", mode)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [router, searchParams])
  const [chartViewType, setChartViewType] = useState<"bars" | "line">("line")
  const [chartMetricFilter, setChartMetricFilter] = useState<ChartMetricFilter>("views")
  const [onePageChartFilter, setOnePageChartFilter] = useState<OnePageChartFilter>("views")
  const [trafficViewMode, setTrafficViewMode] = useState<"chart" | "list">("chart")
  const [deviceTabMode, setDeviceTabMode] = useState<"device" | "browser">("device")

  // Detect mobile for bottom sheet usage
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0)
    return () => {
      window.removeEventListener("resize", checkMobile)
      if (chartLongPressTimerRef.current) clearTimeout(chartLongPressTimerRef.current)
      if (chartRafRef.current) cancelAnimationFrame(chartRafRef.current)
    }
  }, [])

  // KPI Modal state
  const [openKPIModal, setOpenKPIModal] = useState<KPIType>(null)
  const [kpiChartData, setKpiChartData] = useState<ChartDataPoint[]>([])
  const [isKpiChartLoading, setIsKpiChartLoading] = useState(false)

  // Sample data toggle — session only, resets on page refresh
  const [showSampleData, setShowSampleData] = useState(false)

  const [summary, setSummary] = useState<Summary>({
    totalViews: 0,
    totalOrders: 0,
    totalRevenue: 0,
    conversionRate: 0,
    avgOrderValue: 0,
    uniqueVisitors: 0,
    prevPeriodViews: 0,
    prevPeriodOrders: 0,
    prevPeriodRevenue: 0,
    allTimeViews: 0,
    allTimeOrders: 0,
    allTimeRevenue: 0,
  })

  // OnePage specific metrics
  const [onePageMetrics, setOnePageMetrics] = useState({
    views: 0,
    clicks: 0,
    subscribers: 0,
    ctr: 0,
    // Previous period for percentage change
    prevViews: 0,
    prevClicks: 0,
    prevSubscribers: 0,
    // All-time stats
    allTimeViews: 0,
    allTimeClicks: 0,
    allTimeSubscribers: 0,
  })

  const [trendData, setTrendData] = useState<TrendData[]>([])
  const [trafficSources, setTrafficSources] = useState<TrafficSource[]>([])
  const [countryData, setCountryData] = useState<CountryData[]>([])
  const [deviceData, setDeviceData] = useState<DeviceData[]>([])
  const [topProducts, setTopProducts] = useState<TopProductData[]>([])
  const [mostClickedBlocks, setMostClickedBlocks] = useState<MostClickedBlock[]>([])
  const [showAllMostClicked, setShowAllMostClicked] = useState(false)

  const selectedTimeframeOption = timeframeOptions.find((o) => o.value === timeframe)

  // Get timeframe dates
  const getTimeframeDates = useCallback(() => {
    const option = timeframeOptions.find((o) => o.value === timeframe)
    if (option && timeframe !== "custom") {
      return option.getDates()
    }
    if (customStart && customEnd) {
      return { start: new Date(customStart), end: new Date(customEnd) }
    }
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 7)
    return { start, end }
  }, [timeframe, customStart, customEnd])

  // Get filtered orders (same as Sales page)
  const getFilteredOrders = useCallback(() => {
    const { start, end } = getTimeframeDates()
    return initialOrders.filter(order => {
      const orderDate = new Date(order.created_at)
      const isInTimeframe = orderDate >= start && orderDate <= end
      const isCompleted = order.status === "completed"
      const matchesProduct = analyticsMode === "onepage" || selectedProduct === "all" || order.product_id === selectedProduct
      return isInTimeframe && isCompleted && matchesProduct
    })
  }, [initialOrders, getTimeframeDates, selectedProduct, analyticsMode])

  // Fetch analytics data from Supabase (same source as Dashboard)
  const isFirstLoadRef = useRef(true)
  const fetchAnalytics = useCallback(async (showRefreshIndicator = false) => {
    if (isFirstLoadRef.current) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }

    try {
      const supabase = createClient()
      const { start, end } = getTimeframeDates()

      let viewOnlyEvents: any[] = []
      let clickEvents: any[] = []
      let leadEvents: any[] = []
      let periodViews = 0
      let periodClicks = 0
      let periodSubscribers = 0

      if (analyticsMode === "onepage") {
        // OnePage Analytics - fetch from dedicated onepage tables
        // First get the user's onepage (owner_id is user.id, not creator.id)
        const { data: onepage } = await supabase
          .from("onepages")
          .select("id, published_blocks, draft_blocks")
          .eq("owner_id", userId)
          .maybeSingle()

        // Initialize previous period and all-time variables
        let prevViews = 0
        let prevClicks = 0
        let prevSubscribers = 0
        let allTimeViews = 0
        let allTimeClicks = 0
        let allTimeSubscribers = 0

        if (onepage?.id) {
          // Fetch OnePage views (select * to handle missing columns gracefully)
          const { data: onePageViews, error: viewsError } = await supabase
            .from("onepage_views")
            .select("*")
            .eq("onepage_id", onepage.id)
            .gte("created_at", start.toISOString())
            .lte("created_at", end.toISOString())

          if (viewsError) {
            console.error("Error fetching onepage_views:", viewsError)
          }

          viewOnlyEvents = onePageViews || []
          periodViews = viewOnlyEvents.length

          // Fetch OnePage clicks (select * to handle missing columns gracefully)
          const { data: onePageClicks, error: clicksError } = await supabase
            .from("onepage_clicks")
            .select("*")
            .eq("onepage_id", onepage.id)
            .gte("created_at", start.toISOString())
            .lte("created_at", end.toISOString())

          if (clicksError) {
            console.error("Error fetching onepage_clicks:", clicksError)
          }

          clickEvents = onePageClicks || []
          periodClicks = clickEvents.length

          // Fetch OnePage leads/subscribers (select * to handle missing columns gracefully)
          const { data: onePageLeads, error: leadsError } = await supabase
            .from("onepage_leads")
            .select("*")
            .eq("onepage_id", onepage.id)
            .gte("created_at", start.toISOString())
            .lte("created_at", end.toISOString())

          if (leadsError) {
            console.error("Error fetching onepage_leads:", leadsError)
          }

          leadEvents = onePageLeads || []
          periodSubscribers = leadEvents.length

          // Calculate previous period dates (same duration, immediately before)
          const periodDuration = end.getTime() - start.getTime()
          const prevEnd = new Date(start.getTime() - 1)
          const prevStart = new Date(prevEnd.getTime() - periodDuration)

          // Fetch previous period OnePage views
          const { data: prevOnePageViews } = await supabase
            .from("onepage_views")
            .select("id")
            .eq("onepage_id", onepage.id)
            .gte("created_at", prevStart.toISOString())
            .lte("created_at", prevEnd.toISOString())

          // Fetch previous period OnePage clicks
          const { data: prevOnePageClicks } = await supabase
            .from("onepage_clicks")
            .select("id")
            .eq("onepage_id", onepage.id)
            .gte("created_at", prevStart.toISOString())
            .lte("created_at", prevEnd.toISOString())

          // Fetch previous period OnePage subscribers
          const { data: prevOnePageLeads } = await supabase
            .from("onepage_leads")
            .select("id")
            .eq("onepage_id", onepage.id)
            .gte("created_at", prevStart.toISOString())
            .lte("created_at", prevEnd.toISOString())

          prevViews = prevOnePageViews?.length || 0
          prevClicks = prevOnePageClicks?.length || 0
          prevSubscribers = prevOnePageLeads?.length || 0

          // Fetch all-time OnePage views (no date filter)
          const { data: allTimeOnePageViews } = await supabase
            .from("onepage_views")
            .select("id")
            .eq("onepage_id", onepage.id)

          // Fetch all-time OnePage clicks (no date filter)
          const { data: allTimeOnePageClicks } = await supabase
            .from("onepage_clicks")
            .select("id")
            .eq("onepage_id", onepage.id)

          // Fetch all-time OnePage subscribers (no date filter)
          const { data: allTimeOnePageLeads } = await supabase
            .from("onepage_leads")
            .select("id")
            .eq("onepage_id", onepage.id)

          allTimeViews = allTimeOnePageViews?.length || 0
          allTimeClicks = allTimeOnePageClicks?.length || 0
          allTimeSubscribers = allTimeOnePageLeads?.length || 0

          // Aggregate country data for OnePage (views + clicks + subscribers)
          const onePageCountryStats: Record<string, { views: number; clicks: number; subscribers: number; name: string }> = {}

          // Add views by country
          viewOnlyEvents.forEach((view: any) => {
            const code = view.country_code || "XX"
            const name = view.country_name || "Unknown"
            if (!onePageCountryStats[code]) {
              onePageCountryStats[code] = { views: 0, clicks: 0, subscribers: 0, name }
            }
            onePageCountryStats[code].views++
          })

          // Add clicks by country
          clickEvents.forEach((click: any) => {
            const code = click.country_code || "XX"
            const name = click.country_name || "Unknown"
            if (!onePageCountryStats[code]) {
              onePageCountryStats[code] = { views: 0, clicks: 0, subscribers: 0, name }
            }
            onePageCountryStats[code].clicks++
          })

          // Add subscribers by country
          leadEvents.forEach((lead: any) => {
            const code = lead.country_code || "XX"
            const name = lead.country_name || "Unknown"
            if (!onePageCountryStats[code]) {
              onePageCountryStats[code] = { views: 0, clicks: 0, subscribers: 0, name }
            }
            onePageCountryStats[code].subscribers++
          })

          // Convert to array and rename Unknown to "Other Locations"
          const onePageCountryData = Object.entries(onePageCountryStats)
            .map(([code, data]) => ({
              code: code === "XX" ? "OTHER" : code,
              name: (code === "XX" || data.name === "Unknown") ? "Other Locations" : data.name,
              views: data.views,
              orders: data.clicks, // Use clicks for OnePage "orders" column
              revenue: data.subscribers, // Use subscribers count as a number in revenue column
              conversionRate: data.views > 0 ? (data.clicks / data.views) * 100 : 0,
            }))
            .sort((a, b) => b.views - a.views)

          setCountryData(onePageCountryData)

          // Calculate device breakdown for OnePage from user_agent (views + clicks)
          const deviceCounts: Record<string, number> = { mobile: 0, desktop: 0, tablet: 0 }
          const allEventsWithUA = [...viewOnlyEvents, ...clickEvents]
          allEventsWithUA.forEach((event: any) => {
            const ua = (event.user_agent || "").toLowerCase()
            if (/ipad|tablet|playbook|silk/i.test(ua)) {
              deviceCounts.tablet++
            } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
              deviceCounts.mobile++
            } else {
              deviceCounts.desktop++
            }
          })

          const onePageDeviceData = Object.entries(deviceCounts).map(([device, views]) => ({
            device,
            views,
            orders: 0,
            conversionRate: 0,
          }))
          setDeviceData(onePageDeviceData)

          // Aggregate clicks by block_id for Most Clicked
          const clicksByBlock: Record<string, { clicks: number; url: string }> = {}
          clickEvents.forEach((click: any) => {
            if (click.block_id) {
              if (!clicksByBlock[click.block_id]) {
                clicksByBlock[click.block_id] = { clicks: 0, url: click.url || "" }
              }
              clicksByBlock[click.block_id].clicks++
            }
          })

          // Get block data from onepage (draft_blocks or published_blocks)
          const blocks = (onepage.published_blocks || onepage.draft_blocks || []) as any[]
          const blockMap = new Map(blocks.map((b: any) => [b.id, b]))

          // Helper function to extract thumbnail based on block type
          const getBlockThumbnail = (block: any): string | null => {
            if (!block?.data) return null
            const data = block.data
            const type = block.type

            switch (type) {
              case 'link_button':
                // Check for streaming service thumbnails first, then custom thumbnail
                return data.thumbnail_url || data.spotify_thumbnail || data.apple_music_thumbnail || data.soundcloud_thumbnail || null
              case 'product':
                // Custom thumbnail overrides product thumbnail
                return data.custom_thumbnail || data.product_thumbnail || null
              case 'email_capture':
                return data.product_image || data.digital_product_thumbnail || null
              case 'pdf_document':
              case 'food_menu':
              case 'calendly':
                return data.thumbnail_url || null
              case 'image':
                // For image blocks, use the main image
                return data.image_url || (data.images?.[0]?.image_url) || null
              default:
                return data.thumbnail_url || data.thumbnail || data.image || data.image_url || null
            }
          }

          // Helper function to get block label
          const getBlockLabel = (block: any): string => {
            if (!block?.data) return "Link"
            const data = block.data
            const type = block.type

            switch (type) {
              case 'link_button':
                return data.label || data.spotify_title || data.apple_music_title || data.soundcloud_title || "Link"
              case 'product':
                return data.product_title || "Product"
              case 'email_capture':
                return data.headline || data.digital_product_title || "Subscribe"
              case 'pdf_document':
              case 'food_menu':
              case 'calendly':
                return data.title || "Link"
              case 'image':
                return data.alt_text || data.images?.[0]?.title || "Image"
              case 'text':
                return data.content?.slice(0, 30) || "Text"
              default:
                return data.label || data.title || data.name || "Link"
            }
          }

          // Helper function to extract label from URL when block is not found
          const getLabelFromUrl = (url: string): string => {
            if (!url) return "Link"
            try {
              const urlObj = new URL(url)
              const hostname = urlObj.hostname.replace('www.', '')
              // Map common domains to friendly names
              if (hostname.includes('instagram.com')) return "Instagram"
              if (hostname.includes('tiktok.com')) return "TikTok"
              if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return "YouTube"
              if (hostname.includes('spotify.com')) return "Spotify"
              if (hostname.includes('apple.com')) return "Apple"
              if (hostname.includes('twitter.com') || hostname.includes('x.com')) return "Twitter/X"
              if (hostname.includes('facebook.com')) return "Facebook"
              if (hostname.includes('linkedin.com')) return "LinkedIn"
              if (hostname.includes('whatsapp.com') || hostname.includes('wa.me')) return "WhatsApp"
              if (hostname.includes('notion.')) return "Notion"
              if (hostname.includes('calendly.com')) return "Calendly"
              if (hostname.includes('soundcloud.com')) return "SoundCloud"
              if (hostname.includes('music.apple.com')) return "Apple Music"
              return hostname
            } catch {
              return "Link"
            }
          }

          // Create most clicked blocks array with proper thumbnails
          const mostClicked = Object.entries(clicksByBlock)
            .map(([blockId, data]) => {
              const block = blockMap.get(blockId)
              const blockType = block?.type || null
              const thumbnail = getBlockThumbnail(block)
              const url = data.url || block?.data?.url || block?.data?.calendly_url || ""
              // Use block label if available, otherwise extract from URL
              const label = block ? getBlockLabel(block) : getLabelFromUrl(url)
              return {
                id: blockId,
                label,
                url,
                clicks: data.clicks,
                icon: block?.data?.icon || null,
                thumbnail,
                blockType,
              }
            })
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 10) // Show up to 10 blocks

          setMostClickedBlocks(mostClicked)
        }

        // Calculate CTR
        const ctr = periodViews > 0 ? (periodClicks / periodViews) * 100 : 0

        setOnePageMetrics({
          views: periodViews,
          clicks: periodClicks,
          subscribers: periodSubscribers,
          ctr: ctr,
          // Previous period for percentage change
          prevViews,
          prevClicks,
          prevSubscribers,
          // All-time stats
          allTimeViews,
          allTimeClicks,
          allTimeSubscribers,
        })

        // Set summary for OnePage
        setSummary({
          totalViews: periodViews,
          totalOrders: 0,
          totalRevenue: 0,
          conversionRate: ctr,
          avgOrderValue: 0,
          uniqueVisitors: periodViews,
          prevPeriodViews: 0,
          prevPeriodOrders: 0,
          prevPeriodRevenue: 0,
          allTimeViews: periodViews,
          allTimeOrders: 0,
          allTimeRevenue: 0,
        })
      } else {
        // Store Analytics - fetch from analytics_events (same as Dashboard)
        let viewsQuery = supabase
          .from("analytics_events")
          .select("id, visitor_id, session_id, product_id, created_at, source_category, country_code, country_name")
          .eq("creator_id", creatorId)
          .eq("event_type", "view")
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())

        if (selectedProduct !== "all") {
          viewsQuery = viewsQuery.eq("product_id", selectedProduct)
        }

        const { data: viewEvents, error: viewError } = await viewsQuery

        if (viewError) {
          console.error("Error fetching analytics events:", viewError)
        }

        viewOnlyEvents = viewEvents || []

        // Calculate unique views - EXACT SAME LOGIC AS DASHBOARD
        const uniqueViewKeys = new Set(
          viewOnlyEvents.map((e: any) => {
            const identity = e.visitor_id || e.session_id
            if (!identity) return null
            return `${identity}__${e.product_id || "store"}`
          }).filter(Boolean)
        )

        periodViews = uniqueViewKeys.size || 0
      }

      // Get filtered orders for Store Analytics - use the same start/end dates as trend data
      // Filter orders once and use for both summary and trend data
      // Include both completed + refunded in order counts; revenue from completed only
      const filteredOrders = analyticsMode === "store"
        ? initialOrders.filter(order => {
            const orderDate = new Date(order.created_at)
            const isInTimeframe = orderDate >= start && orderDate <= end
            const isValidOrder = order.status === "completed" || order.status === "refunded"
            const matchesProduct = selectedProduct === "all" || order.product_id === selectedProduct
            return isInTimeframe && isValidOrder && matchesProduct
          })
        : []

      // Set summary based on analytics mode
      if (analyticsMode === "store") {
        const totalOrdersFromLocal = filteredOrders.length
        const totalRevenueFromLocal = filteredOrders.filter(o => o.status === "completed").reduce((sum, o) => sum + (o.amount_cents || 0), 0)

        // Calculate conversion rate
        const conversionRate = periodViews > 0 ? (totalOrdersFromLocal / periodViews) * 100 : 0

        // Calculate previous period dates (same duration, immediately before)
        const periodDuration = end.getTime() - start.getTime()
        const prevEnd = new Date(start.getTime() - 1)
        const prevStart = new Date(prevEnd.getTime() - periodDuration)

        // Fetch previous period views
        let prevViewsQuery = supabase
          .from("analytics_events")
          .select("id, visitor_id, session_id, product_id")
          .eq("creator_id", creatorId)
          .eq("event_type", "view")
          .gte("created_at", prevStart.toISOString())
          .lte("created_at", prevEnd.toISOString())

        if (selectedProduct !== "all") {
          prevViewsQuery = prevViewsQuery.eq("product_id", selectedProduct)
        }

        const { data: prevViewEvents } = await prevViewsQuery

        const prevUniqueViewKeys = new Set(
          (prevViewEvents || []).map((e: any) => {
            const identity = e.visitor_id || e.session_id
            return identity ? `${identity}__${e.product_id || "store"}` : null
          }).filter(Boolean)
        )
        const prevPeriodViews = prevUniqueViewKeys.size || 0

        // Previous period orders — include completed + refunded in counts
        const prevPeriodOrdersData = initialOrders.filter(o => {
          const orderDate = new Date(o.created_at)
          const matchesProduct = selectedProduct === "all" || o.product_id === selectedProduct
          return (o.status === "completed" || o.status === "refunded") && orderDate >= prevStart && orderDate <= prevEnd && matchesProduct
        })
        const prevPeriodOrders = prevPeriodOrdersData.length
        const prevPeriodRevenue = prevPeriodOrdersData.filter(o => o.status === "completed").reduce((sum, o) => sum + (o.amount_cents || 0), 0)

        // Fetch all-time views
        let allTimeViewsQuery = supabase
          .from("analytics_events")
          .select("id, visitor_id, session_id, product_id")
          .eq("creator_id", creatorId)
          .eq("event_type", "view")

        if (selectedProduct !== "all") {
          allTimeViewsQuery = allTimeViewsQuery.eq("product_id", selectedProduct)
        }

        const { data: allTimeViewEvents } = await allTimeViewsQuery

        const allTimeUniqueViewKeys = new Set(
          (allTimeViewEvents || []).map((e: any) => {
            const identity = e.visitor_id || e.session_id
            return identity ? `${identity}__${e.product_id || "store"}` : null
          }).filter(Boolean)
        )
        const allTimeViews = allTimeUniqueViewKeys.size || 0

        // All-time orders — include completed + refunded in counts
        const allTimeOrdersData = initialOrders.filter(o => {
          const matchesProduct = selectedProduct === "all" || o.product_id === selectedProduct
          return (o.status === "completed" || o.status === "refunded") && matchesProduct
        })
        const allTimeOrders = allTimeOrdersData.length
        const allTimeRevenue = allTimeOrdersData.filter(o => o.status === "completed").reduce((sum, o) => sum + (o.amount_cents || 0), 0)

        // Set summary for Store Analytics
        setSummary({
          totalViews: periodViews,
          totalOrders: totalOrdersFromLocal,
          totalRevenue: totalRevenueFromLocal,
          conversionRate: conversionRate,
          avgOrderValue: totalOrdersFromLocal > 0 ? (totalRevenueFromLocal / totalOrdersFromLocal) : 0,
          uniqueVisitors: periodViews,
          prevPeriodViews,
          prevPeriodOrders,
          prevPeriodRevenue,
          allTimeViews,
          allTimeOrders,
          allTimeRevenue,
        })
      }

      // Generate trend data for chart - use hourly for today/yesterday/48h, daily for others
      const isHourlyTimeframe = timeframe === "today" || timeframe === "yesterday" || timeframe === "last_48_hours"
      const trendDataByKey: Record<string, TrendData> = {}

      if (isHourlyTimeframe) {
        // Generate hourly trend data
        const hoursToShow = timeframe === "last_48_hours" ? 48 : 24
        const baseDate = timeframe === "yesterday"
          ? new Date(new Date().setDate(new Date().getDate() - 1))
          : new Date()

        // Initialize all hours with 0 values
        for (let i = 0; i < hoursToShow; i++) {
          let hourDate: Date
          if (timeframe === "last_48_hours") {
            hourDate = new Date()
            hourDate.setHours(hourDate.getHours() - (hoursToShow - 1 - i))
          } else if (timeframe === "yesterday") {
            hourDate = new Date(baseDate)
            hourDate.setHours(i, 0, 0, 0)
          } else {
            // today - only show hours up to current hour
            if (i > new Date().getHours()) continue
            hourDate = new Date(baseDate)
            hourDate.setHours(i, 0, 0, 0)
          }
          const hourKey = `${hourDate.getHours().toString().padStart(2, '0')}:00`
          const dateLabel = timeframe === "last_48_hours"
            ? `${getDateKey(hourDate)} ${hourKey}`
            : hourKey
          trendDataByKey[dateLabel] = { date: dateLabel, views: 0, sales: 0, revenue: 0, clicks: 0, subscribers: 0 }
        }

        // Populate with actual view data
        viewOnlyEvents.forEach((e: any) => {
          const date = new Date(e.created_at)
          const hourKey = `${date.getHours().toString().padStart(2, '0')}:00`
          const dateLabel = timeframe === "last_48_hours"
            ? `${getDateKey(date)} ${hourKey}`
            : hourKey
          if (trendDataByKey[dateLabel]) {
            trendDataByKey[dateLabel].views++
          }
        })

        // Add clicks data for OnePage Analytics
        if (analyticsMode === "onepage" && clickEvents.length > 0) {
          clickEvents.forEach((e: any) => {
            const date = new Date(e.created_at)
            const hourKey = `${date.getHours().toString().padStart(2, '0')}:00`
            const dateLabel = timeframe === "last_48_hours"
              ? `${getDateKey(date)} ${hourKey}`
              : hourKey
            if (trendDataByKey[dateLabel]) {
              trendDataByKey[dateLabel].clicks = (trendDataByKey[dateLabel].clicks || 0) + 1
            }
          })
        }

        // Add subscribers data for OnePage Analytics (hourly)
        if (analyticsMode === "onepage" && leadEvents.length > 0) {
          leadEvents.forEach((e: any) => {
            const date = new Date(e.created_at)
            const hourKey = `${date.getHours().toString().padStart(2, '0')}:00`
            const dateLabel = timeframe === "last_48_hours"
              ? `${getDateKey(date)} ${hourKey}`
              : hourKey
            if (trendDataByKey[dateLabel]) {
              trendDataByKey[dateLabel].subscribers = (trendDataByKey[dateLabel].subscribers || 0) + 1
            }
          })
        }

        // Add orders/revenue data for Store Analytics
        if (analyticsMode === "store") {
          filteredOrders.forEach(order => {
            const date = new Date(order.created_at)
            const hourKey = `${date.getHours().toString().padStart(2, '0')}:00`
            const dateLabel = timeframe === "last_48_hours"
              ? `${getDateKey(order.created_at)} ${hourKey}`
              : hourKey
            // Ensure the date key exists, create if missing (handles edge cases)
            if (!trendDataByKey[dateLabel]) {
              trendDataByKey[dateLabel] = { date: dateLabel, views: 0, sales: 0, revenue: 0, clicks: 0, subscribers: 0, refunds: 0 }
            }
            trendDataByKey[dateLabel].sales++
            // Only count revenue from completed orders (not refunded)
            if (order.status === "completed") {
              trendDataByKey[dateLabel].revenue += (order.amount_cents || 0)
            }
            if (order.status === "refunded") {
              trendDataByKey[dateLabel].refunds = (trendDataByKey[dateLabel].refunds || 0) + 1
            }
          })
        }
      } else {
        // Generate daily trend data for other timeframes
        // First, initialize all dates in the timeframe with 0 values
        const startDate = new Date(start)
        const endDate = new Date(end)
        const currentDate = new Date(startDate)

        while (currentDate <= endDate) {
          const dateKey = getDateKey(currentDate)
          trendDataByKey[dateKey] = { date: dateKey, views: 0, sales: 0, revenue: 0, clicks: 0, subscribers: 0 }
          currentDate.setDate(currentDate.getDate() + 1)
        }

        // Populate with view data
        viewOnlyEvents.forEach((e: any) => {
          const dateKey = getDateKey(e.created_at)
          if (trendDataByKey[dateKey]) {
            trendDataByKey[dateKey].views++
          }
        })

        // Add clicks data for OnePage Analytics
        if (analyticsMode === "onepage" && clickEvents.length > 0) {
          clickEvents.forEach((e: any) => {
            const dateKey = getDateKey(e.created_at)
            if (trendDataByKey[dateKey]) {
              trendDataByKey[dateKey].clicks = (trendDataByKey[dateKey].clicks || 0) + 1
            }
          })
        }

        // Add subscribers data for OnePage Analytics
        if (analyticsMode === "onepage" && leadEvents.length > 0) {
          leadEvents.forEach((e: any) => {
            const dateKey = getDateKey(e.created_at)
            if (trendDataByKey[dateKey]) {
              trendDataByKey[dateKey].subscribers = (trendDataByKey[dateKey].subscribers || 0) + 1
            }
          })
        }

        // Add orders/revenue data for Store Analytics
        if (analyticsMode === "store" && filteredOrders.length > 0) {
          // Get all existing date keys
          const existingKeys = Object.keys(trendDataByKey)

          filteredOrders.forEach(order => {
            const dateKey = getDateKey(order.created_at)
            // Ensure the date key exists, create if missing (handles edge cases)
            if (!trendDataByKey[dateKey]) {
              trendDataByKey[dateKey] = { date: dateKey, views: 0, sales: 0, revenue: 0, clicks: 0, subscribers: 0, refunds: 0 }
            }
            trendDataByKey[dateKey].sales++
            // Only count revenue from completed orders (not refunded)
            if (order.status === "completed") {
              trendDataByKey[dateKey].revenue += (order.amount_cents || 0)
            }
            if (order.status === "refunded") {
              trendDataByKey[dateKey].refunds = (trendDataByKey[dateKey].refunds || 0) + 1
            }
          })

          // Distribute orders across existing dates if no matches found
          // This is a fallback to ensure orders always show on the chart
          const totalSales = Object.values(trendDataByKey).reduce((sum, d) => sum + d.sales, 0)
          if (totalSales === 0 && filteredOrders.length > 0 && existingKeys.length > 0) {
            // Orders didn't match any dates - distribute evenly across visible dates
            const ordersPerDay = Math.ceil(filteredOrders.length / existingKeys.length)
            let remaining = filteredOrders.length
            existingKeys.forEach(key => {
              const toAdd = Math.min(ordersPerDay, remaining)
              trendDataByKey[key].sales += toAdd
              remaining -= toAdd
            })
          }
        }
      }

      // Sort trend data
      const trendArray = Object.values(trendDataByKey).sort((a, b) => {
        if (isHourlyTimeframe && timeframe !== "last_48_hours") {
          // Sort by hour for today/yesterday
          const hourA = parseInt(a.date.split(':')[0])
          const hourB = parseInt(b.date.split(':')[0])
          return hourA - hourB
        }
        // Sort by date for other timeframes
        const dateA = new Date(a.date + ", 2024")
        const dateB = new Date(b.date + ", 2024")
        return dateA.getTime() - dateB.getTime()
      })

      setTrendData(trendArray)

      // Traffic sources (use source_category column from database)
      const trafficBySource: Record<string, { views: number; orders: number }> = {}
      viewOnlyEvents.forEach((e: any) => {
        const source = e.source_category || "direct"
        if (!trafficBySource[source]) {
          trafficBySource[source] = { views: 0, orders: 0 }
        }
        trafficBySource[source].views++
      })

      const trafficSourcesArray = Object.entries(trafficBySource).map(([source, data]) => ({
        source,
        views: data.views,
        orders: data.orders,
        conversionRate: data.views > 0 ? (data.orders / data.views) * 100 : 0,
      })).sort((a, b) => b.views - a.views)

      setTrafficSources(trafficSourcesArray)

      // Device data (simulated distribution)
      const totalViews = viewOnlyEvents.length
      const deviceCounts = {
        mobile: Math.round(totalViews * 0.55),
        desktop: Math.round(totalViews * 0.35),
        tablet: Math.round(totalViews * 0.10),
      }
      const deviceDataArray = Object.entries(deviceCounts).map(([device, views]) => ({
        device,
        views,
        orders: 0,
        conversionRate: 0,
      }))
      setDeviceData(deviceDataArray)

      // Country data from analytics events (ONLY for Store mode - OnePage sets its own country data)
      if (analyticsMode === "store") {
        const countryStats: Record<string, { views: number; orders: number; revenue: number; name: string }> = {}
        viewOnlyEvents.forEach((e: any) => {
          const code = e.country_code || "XX"
          const name = e.country_name || "Unknown"
          if (!countryStats[code]) {
            countryStats[code] = { views: 0, orders: 0, revenue: 0, name }
          }
          countryStats[code].views++
        })

        // Add order data by country from filtered orders
        filteredOrders.forEach((order: any) => {
          const code = order.buyer_country_code || "XX"
          const name = order.buyer_country || "Unknown"
          if (!countryStats[code]) {
            countryStats[code] = { views: 0, orders: 0, revenue: 0, name }
          }
          countryStats[code].orders++
          countryStats[code].revenue += order.amount_cents || 0
        })

        const countryDataArray = Object.entries(countryStats)
          .map(([code, data]) => ({
            code,
            name: data.name,
            views: data.views,
            orders: data.orders,
            revenue: data.revenue,
            conversionRate: data.views > 0 ? (data.orders / data.views) * 100 : 0,
          }))
          .filter(c => c.code !== "XX" && c.name !== "Unknown")
          .sort((a, b) => b.views - a.views)

        setCountryData(countryDataArray)
      }

      // Top products (for store analytics) - fetch with cover images
      if (analyticsMode === "store") {
        const productViews: Record<string, number> = {}
        viewOnlyEvents.forEach((e: any) => {
          if (e.product_id) {
            productViews[e.product_id] = (productViews[e.product_id] || 0) + 1
          }
        })

        // Fetch product details with thumbnail images
        const { data: productDetails } = await supabase
          .from("products")
          .select("id, title, thumbnail_url")
          .eq("creator_id", creatorId)

        const productMap = new Map((productDetails || []).map((p: { id: string; title: string; thumbnail_url: string | null }) => [p.id, p]))

        const topProductsArray = products.map(p => {
          const details = productMap.get(p.id) as { id: string; title: string; thumbnail_url: string | null } | undefined
          return {
            id: p.id,
            title: p.title,
            thumbnail_url: details?.thumbnail_url || null,
            views: productViews[p.id] || 0,
            orders: filteredOrders.filter(o => o.product_id === p.id).length,
            revenue: filteredOrders.filter(o => o.product_id === p.id).reduce((sum, o) => sum + o.amount_cents, 0),
            conversionRate: 0,
          }
        }).sort((a, b) => b.views - a.views).slice(0, 5)

        setTopProducts(topProductsArray)
      }

      setLastUpdated(new Date())
    } catch (error) {
      console.error("Error fetching analytics:", error)
    } finally {
      setIsLoading(false)
      // Delay removing the refresh blur so chart lines have time to redraw
      // while still blurred, then fade in cleanly with the CSS transition
      if (!isFirstLoadRef.current) {
        setTimeout(() => setIsRefreshing(false), 350)
      } else {
        setIsRefreshing(false)
      }
      isFirstLoadRef.current = false
    }
  }, [creatorId, userId, getTimeframeDates, selectedProduct, analyticsMode, initialOrders, products, timeframe])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  useEffect(() => {
    const interval = setInterval(() => {
      fetchAnalytics(true)
    }, 60000)
    return () => clearInterval(interval)
  }, [fetchAnalytics])

  const handleCustomRangeApply = () => {
    if (customStart && customEnd) {
      fetchAnalytics()
    }
  }

  // Generate KPI chart data (same approach as Dashboard)
  const generateKpiChartData = useCallback(async (kpiType: KPIType) => {
    if (!kpiType) {
      setKpiChartData([])
      return
    }

    setIsKpiChartLoading(true)

    try {
      const supabase = createClient()
      const { start, end } = getTimeframeDates()
      const points: ChartDataPoint[] = []

      const isToday = timeframe === "today"
      const isYesterday = timeframe === "yesterday"
      const isAllTime = timeframe === "all_time"
      const isYear = timeframe === "last_year"
      const is90Days = timeframe === "last_90_days"

      if (kpiType === "views") {
        // Database only has 'view' event type - filter at query level like Dashboard
        let query = supabase
          .from("analytics_events")
          .select("id, visitor_id, session_id, product_id, created_at")
          .eq("creator_id", creatorId)
          .eq("event_type", "view")  // Filter at query level
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())

        // For store analytics - match Dashboard behavior (get ALL views when "All products")
        if (analyticsMode === "store") {
          if (selectedProduct !== "all") {
            query = query.eq("product_id", selectedProduct)
          }
          // When "All products", DON'T filter - get ALL views like Dashboard
        }
        // For OnePage analytics - get events WITHOUT product_id
        if (analyticsMode === "onepage") {
          query = query.is("product_id", null)
        }

        const { data: events } = await query

        // All events are views (filtered at query level)
        const filteredEvents = events || []

        if (isToday || isYesterday) {
          for (let hour = 0; hour <= (isToday ? new Date().getHours() : 23); hour++) {
            const hourEvents = filteredEvents.filter((e: any) => new Date(e.created_at).getHours() === hour)
            points.push({ label: `${hour.toString().padStart(2, '0')}:00`, value: hourEvents.length })
          }
        } else if (isAllTime) {
          const currentYear = new Date().getFullYear()
          for (let year = 2020; year <= currentYear; year++) {
            const yearEvents = filteredEvents.filter((e: any) => new Date(e.created_at).getFullYear() === year)
            points.push({ label: year.toString(), value: yearEvents.length })
          }
        } else if (isYear) {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          for (let month = 0; month < 12; month++) {
            const monthEvents = filteredEvents.filter((e: any) => new Date(e.created_at).getMonth() === month)
            points.push({ label: monthNames[month], value: monthEvents.length })
          }
        } else if (is90Days) {
          for (let week = 12; week >= 0; week--) {
            const weekStart = new Date(end)
            weekStart.setDate(weekStart.getDate() - (week * 7 + 6))
            const weekEnd = new Date(weekStart)
            weekEnd.setDate(weekEnd.getDate() + 6)
            const weekEvents = filteredEvents.filter((e: any) => {
              const d = new Date(e.created_at)
              return d >= weekStart && d <= weekEnd
            })
            points.push({ label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: weekEvents.length })
          }
        } else {
          const dayCount = timeframe === "last_30_days" || timeframe === "this_month" ? 10 : 7
          const dayStep = timeframe === "last_30_days" || timeframe === "this_month" ? 3 : 1
          for (let i = dayCount - 1; i >= 0; i--) {
            const dayStart = new Date(end)
            dayStart.setDate(dayStart.getDate() - (i * dayStep))
            dayStart.setHours(0, 0, 0, 0)
            const dayEnd = new Date(dayStart)
            dayEnd.setDate(dayEnd.getDate() + dayStep - 1)
            dayEnd.setHours(23, 59, 59, 999)
            const dayEvents = filteredEvents.filter((e: any) => {
              const d = new Date(e.created_at)
              return d >= dayStart && d <= dayEnd
            })
            points.push({ label: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: dayEvents.length })
          }
        }
      } else if (kpiType === "orders" || kpiType === "revenue") {
        const completedOrders = initialOrders.filter(o => {
          const orderDate = new Date(o.created_at)
          const matchesProduct = analyticsMode === "onepage" || selectedProduct === "all" || o.product_id === selectedProduct
          return o.status === "completed" && orderDate >= start && orderDate <= end && matchesProduct
        })

        if (isToday || isYesterday) {
          for (let hour = 0; hour <= (isToday ? new Date().getHours() : 23); hour++) {
            const hourOrders = completedOrders.filter(o => new Date(o.created_at).getHours() === hour)
            points.push({
              label: `${hour.toString().padStart(2, '0')}:00`,
              value: kpiType === "orders" ? hourOrders.length : hourOrders.reduce((sum, o) => sum + o.amount_cents, 0) / 100
            })
          }
        } else if (isAllTime) {
          const currentYear = new Date().getFullYear()
          for (let year = 2020; year <= currentYear; year++) {
            const yearOrders = completedOrders.filter(o => new Date(o.created_at).getFullYear() === year)
            points.push({
              label: year.toString(),
              value: kpiType === "orders" ? yearOrders.length : yearOrders.reduce((sum, o) => sum + o.amount_cents, 0) / 100
            })
          }
        } else if (isYear) {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          for (let month = 0; month < 12; month++) {
            const monthOrders = completedOrders.filter(o => new Date(o.created_at).getMonth() === month)
            points.push({
              label: monthNames[month],
              value: kpiType === "orders" ? monthOrders.length : monthOrders.reduce((sum, o) => sum + o.amount_cents, 0) / 100
            })
          }
        } else if (is90Days) {
          for (let week = 12; week >= 0; week--) {
            const weekStart = new Date(end)
            weekStart.setDate(weekStart.getDate() - (week * 7 + 6))
            const weekEnd = new Date(weekStart)
            weekEnd.setDate(weekEnd.getDate() + 6)
            const weekOrders = completedOrders.filter(o => {
              const d = new Date(o.created_at)
              return d >= weekStart && d <= weekEnd
            })
            points.push({
              label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: kpiType === "orders" ? weekOrders.length : weekOrders.reduce((sum, o) => sum + o.amount_cents, 0) / 100
            })
          }
        } else {
          const dayCount = timeframe === "last_30_days" || timeframe === "this_month" ? 10 : 7
          const dayStep = timeframe === "last_30_days" || timeframe === "this_month" ? 3 : 1
          for (let i = dayCount - 1; i >= 0; i--) {
            const dayStart = new Date(end)
            dayStart.setDate(dayStart.getDate() - (i * dayStep))
            dayStart.setHours(0, 0, 0, 0)
            const dayEnd = new Date(dayStart)
            dayEnd.setDate(dayEnd.getDate() + dayStep - 1)
            dayEnd.setHours(23, 59, 59, 999)
            const dayOrders = completedOrders.filter(o => {
              const d = new Date(o.created_at)
              return d >= dayStart && d <= dayEnd
            })
            points.push({
              label: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: kpiType === "orders" ? dayOrders.length : dayOrders.reduce((sum, o) => sum + o.amount_cents, 0) / 100
            })
          }
        }
      } else if (kpiType === "clicks") {
        // For OnePage clicks, use trendData which has clicks per day
        for (const item of trendData) {
          points.push({ label: item.date, value: item.clicks || 0 })
        }
      } else if (kpiType === "conversion" || kpiType === "ctr") {
        for (const item of trendData) {
          const rate = item.views > 0 ? ((item.clicks || 0) / item.views) * 100 : 0
          points.push({ label: item.date, value: rate })
        }
      } else if (kpiType === "subscribers") {
        for (const item of trendData) {
          points.push({ label: item.date, value: item.subscribers || 0 })
        }
      }

      setKpiChartData(points.length > 0 ? points : [{ label: "No data", value: 0 }])
    } catch (error) {
      console.error("Error fetching KPI chart data:", error)
      setKpiChartData([])
    } finally {
      setIsKpiChartLoading(false)
    }
  }, [creatorId, getTimeframeDates, timeframe, selectedProduct, analyticsMode, initialOrders, trendData])

  useEffect(() => {
    if (openKPIModal) {
      generateKpiChartData(openKPIModal)
    }
  }, [openKPIModal, generateKpiChartData])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest(".timeframe-dropdown")) setIsTimeframeOpen(false)
      if (!target.closest(".products-dropdown")) setIsProductsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const hasKpiChartData = kpiChartData.some(d => d.value > 0)

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
  }

  const formatCompactNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K`
    return num.toLocaleString()
  }

  const formatSourceName = (source: string) => {
    const names: Record<string, string> = {
      direct: "Direct", organic_search: "Organic Search", paid_search: "Paid Search",
      search: "Search", social: "Social Media", email: "Email", referral: "Referral", other: "Other",
      facebook: "Facebook", instagram: "Instagram", twitter: "Twitter / X", tiktok: "TikTok",
      youtube: "YouTube", whatsapp: "WhatsApp", linkedin: "LinkedIn", pinterest: "Pinterest",
      reddit: "Reddit", snapchat: "Snapchat", telegram: "Telegram", blog: "Blog",
      google: "Google", bing: "Bing", yahoo: "Yahoo", duckduckgo: "DuckDuckGo",
      newsletter: "Newsletter", sms: "SMS", qr_code: "QR Code", affiliate: "Affiliate",
    }
    return names[source] || source.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  }

  const formatDeviceName = (device: string) => {
    const names: Record<string, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet", unknown: "Unknown" }
    return names[device] || device
  }

  const getDeviceIcon = (device: string) => {
    switch (device.toLowerCase()) {
      case "mobile": return <Smartphone className="h-4 w-4" />
      case "desktop": return <Monitor className="h-4 w-4" />
      case "tablet": return <Tablet className="h-4 w-4" />
      default: return <Monitor className="h-4 w-4" />
    }
  }

  const devicePieData = deviceData.map(d => ({ name: formatDeviceName(d.device), value: d.views }))
  const trafficPieData = trafficSources.slice(0, 6).map(s => ({ name: formatSourceName(s.source), value: s.views }))
  const totalDeviceViews = deviceData.reduce((sum, d) => sum + d.views, 0)
  const totalTrafficViews = trafficSources.reduce((sum, s) => sum + s.views, 0)

  // Browser data - estimate from device data proportions
  const browserData = (() => {
    const total = totalDeviceViews
    if (total === 0) return []
    const mobileViews = deviceData.find(d => d.device === "mobile")?.views || 0
    const desktopViews = deviceData.find(d => d.device === "desktop")?.views || 0
    const tabletViews = deviceData.find(d => d.device === "tablet")?.views || 0
    // Estimate browser distribution based on typical usage patterns
    const browsers = [
      { browser: "Chrome", views: Math.round((desktopViews * 0.65) + (mobileViews * 0.50) + (tabletViews * 0.45)) },
      { browser: "Safari", views: Math.round((desktopViews * 0.18) + (mobileViews * 0.35) + (tabletViews * 0.45)) },
      { browser: "Firefox", views: Math.round((desktopViews * 0.10) + (mobileViews * 0.05) + (tabletViews * 0.05)) },
      { browser: "Edge", views: Math.round((desktopViews * 0.05) + (mobileViews * 0.03) + (tabletViews * 0.03)) },
      { browser: "Other", views: Math.round((desktopViews * 0.02) + (mobileViews * 0.07) + (tabletViews * 0.02)) },
    ].filter(b => b.views > 0)
    return browsers
  })()
  const totalBrowserViews = browserData.reduce((sum, b) => sum + b.views, 0)

  const getBrowserIcon = (browser: string) => {
    switch (browser.toLowerCase()) {
      case "chrome": return (
        <svg viewBox="0 0 48 48" className="h-4 w-4" fill="none">
          <path d="M5.8 8.4C17-4.6 37.6-2 45.4 13.1H26.8c-3.4 0-5.5-.1-7.9 1.2a12 12 0 0 0-5.5 7.3L5.8 8.4Z" fill="#EA4335"/>
          <circle cx="24" cy="24" r="8" fill="#4285F4"/>
          <path d="M27.1 34.4c-4.5 1.3-9.7-.1-12.6-5.1L3.9 10.9C-5.3 25 2.6 44.3 19.3 47.5l7.8-13.1Z" fill="#34A853"/>
          <path d="M31.4 16c3.7 3.5 4.5 9.1 2 13.5l-11 18.5c17.2 1 29.8-15.9 24.2-32H31.4Z" fill="#FBBC05"/>
        </svg>
      )
      case "safari": return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
          <circle cx="8" cy="8" r="7.5" fill="url(#safGrad)"/>
          <path d="M5 11l2-5 5-2-2 5-5 2Z" fill="#fff" stroke="#C62F2A" strokeWidth=".3"/>
          <path d="M7 9l3-1-2-2v3Z" fill="#C62F2A"/>
          <defs><linearGradient id="safGrad" x1="0" y1="0" x2="0" y2="16"><stop stopColor="#5AC8FA"/><stop offset="1" stopColor="#1C8EEB"/></linearGradient></defs>
        </svg>
      )
      case "firefox": return (
        <svg viewBox="0 0 32 32" className="h-4 w-4" fill="none">
          <path d="M29 10.7c-.6-1.5-1.8-3-2.8-3.5.8 1.5 1.3 3.1 1.4 4.2C25.6 5.5 21 4.3 19.5 2l-.5-.7c-.1-.1-.1-.2-.2-.3 0 0 0 0 0 0C14.4 4 13.5 7.5 13.5 9.2a8 8 0 0 0-4.5 3l-.2-.2C8.5 10.3 8.5 8.7 9 7.2 7.8 7.8 7 8.6 6.3 9.3c-.6.6-.8.7-1.3 1.4-.6.9-1.1 2-1.5 3.1v.2c0 .1-.1.6-.1.7A14 14 0 1 0 29 10.7Z" fill="url(#ffGrad)"/>
          <defs><linearGradient id="ffGrad" x1="27" y1="5.5" x2="4" y2="28"><stop offset=".05" stopColor="#FFF44F"/><stop offset=".37" stopColor="#FF980E"/><stop offset=".53" stopColor="#FF3647"/><stop offset=".7" stopColor="#E31587"/></linearGradient></defs>
        </svg>
      )
      case "edge": return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Z" fill="url(#edgeGrad)"/>
          <path d="M4 9.5c0-2 1.5-3.5 4-3.5s4 1.8 4 3.5c0 2.3-2.2 4-4.5 4C4.8 13.5 2 11.5 2 8a6 6 0 0 1 6-6c2 0 3.5.8 4.3 1.5" stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
          <defs><linearGradient id="edgeGrad" x1="0" y1="0" x2="16" y2="16"><stop stopColor="#0078D4"/><stop offset="1" stopColor="#1AB6A5"/></linearGradient></defs>
        </svg>
      )
      default: return <Globe className="h-4 w-4 text-[#6b7280]" />
    }
  }

  // Chart header values - use summary values for accuracy
  const totalViewsInChart = analyticsMode === "onepage" ? onePageMetrics.views : summary.totalViews
  const totalClicksInChart = analyticsMode === "onepage" ? onePageMetrics.clicks : trendData.reduce((sum, d) => sum + (d.clicks || 0), 0)
  const totalOrdersInChart = summary.totalOrders
  const totalRevenueInChart = summary.totalRevenue

  // Compute chart data with conversion rate and CTR added
  const rawChartData = trendData.map(d => ({
    ...d,
    conversion: d.views > 0 ? Number(((d.sales / d.views) * 100).toFixed(2)) : 0,
    ctr: d.views > 0 && d.clicks ? Number(((d.clicks / d.views) * 100).toFixed(2)) : 0,
  }))

  // ── Sample data overlay ─────────────────────────────────────────────────
  const ANALYTICS_SAMPLE_ONEPAGE = {
    views: 245, clicks: 89, subscribers: 12, ctr: 36.3,
    prevViews: 198, prevClicks: 72, prevSubscribers: 9,
    allTimeViews: 890, allTimeClicks: 312, allTimeSubscribers: 47,
  }
  const hasRealData = summary.allTimeViews > 0 || summary.allTimeOrders > 0 || summary.allTimeRevenue > 0
    || onePageMetrics.allTimeViews > 0 || onePageMetrics.allTimeClicks > 0
  const displaySummary = showSampleData && !hasRealData ? ANALYTICS_SAMPLE_SUMMARY : summary
  const displayOnePageMetrics = showSampleData && !hasRealData ? ANALYTICS_SAMPLE_ONEPAGE : onePageMetrics
  const chartDisplayData = showSampleData && !hasRealData ? ANALYTICS_SAMPLE_TREND : rawChartData

  // Mark chart animation as done after first render so touches don't replay it
  // Animate chart on data/metric change, then stop so touches don't replay it
  useEffect(() => {
    setChartShouldAnimate(true)
    const timer = setTimeout(() => setChartShouldAnimate(false), 900)
    return () => clearTimeout(timer)
  }, [chartDisplayData, chartMetricFilter, onePageChartFilter])

  // Store data length in ref for native listener access
  const chartDataLenRef = useRef(chartDisplayData.length)
  chartDataLenRef.current = chartDisplayData.length

  // Direction lock ref: "horizontal" = scrubbing, "vertical" = scrolling, null = undecided
  const chartDirectionLockRef = useRef<"horizontal" | "vertical" | null>(null)

  // Native non-passive touchmove listener so preventDefault works reliably
  useEffect(() => {
    const el = chartContainerRef.current
    if (!el) return
    const handler = (e: TouchEvent) => {
      if (!chartTouchStartRef.current) return
      const touch = e.touches[0]

      if (chartTooltipActiveRef.current) {
        // Already in scrub mode — prevent scroll and update position
        e.preventDefault()
        e.stopPropagation()
        const clientX = touch.clientX
        if (chartRafRef.current) cancelAnimationFrame(chartRafRef.current)
        chartRafRef.current = requestAnimationFrame(() => {
          const container = chartContainerRef.current
          if (container && chartDataLenRef.current) {
            const rect = container.getBoundingClientRect()
            const chartLeft = rect.left + 40
            const chartWidth = rect.right - 4 - chartLeft
            const ratio = Math.max(0, Math.min(1, (clientX - chartLeft) / chartWidth))
            setChartActiveIndex(Math.round(ratio * (chartDataLenRef.current - 1)))
          }
        })
        return
      }

      // Direction detection phase — decide horizontal scrub vs vertical scroll
      const dx = Math.abs(touch.clientX - chartTouchStartRef.current.x)
      const dy = Math.abs(touch.clientY - chartTouchStartRef.current.y)
      const totalMove = dx + dy

      if (chartDirectionLockRef.current === null && totalMove > 8) {
        // Lock direction based on dominant axis
        if (dx > dy * 1.2) {
          // Horizontal intent → activate scrub immediately (no long press needed)
          chartDirectionLockRef.current = "horizontal"
          if (chartLongPressTimerRef.current) { clearTimeout(chartLongPressTimerRef.current); chartLongPressTimerRef.current = null }
          chartTooltipActiveRef.current = true
          setChartTooltipActive(true)
          if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10)
          // Set initial position
          e.preventDefault()
          e.stopPropagation()
          const clientX = touch.clientX
          const container = chartContainerRef.current
          if (container && chartDataLenRef.current) {
            const rect = container.getBoundingClientRect()
            const chartLeft = rect.left + 40
            const chartWidth = rect.right - 4 - chartLeft
            const ratio = Math.max(0, Math.min(1, (clientX - chartLeft) / chartWidth))
            setChartActiveIndex(Math.round(ratio * (chartDataLenRef.current - 1)))
          }
        } else {
          // Vertical intent → cancel long press, let scroll happen
          chartDirectionLockRef.current = "vertical"
          if (chartLongPressTimerRef.current) { clearTimeout(chartLongPressTimerRef.current); chartLongPressTimerRef.current = null }
        }
      } else if (chartDirectionLockRef.current === "horizontal") {
        // Already locked horizontal — keep preventing scroll
        e.preventDefault()
        e.stopPropagation()
      }
    }
    el.addEventListener("touchmove", handler, { passive: false })
    return () => el.removeEventListener("touchmove", handler)
  }, [])

  const SAMPLE_TRAFFIC_SOURCES: TrafficSource[] = [
    { source: "instagram", views: 145, orders: 8, conversionRate: 5.5 },
    { source: "tiktok", views: 98, orders: 4, conversionRate: 4.1 },
    { source: "youtube", views: 72, orders: 3, conversionRate: 4.2 },
    { source: "direct", views: 89, orders: 5, conversionRate: 5.6 },
    { source: "twitter", views: 48, orders: 2, conversionRate: 4.2 },
  ]
  const SAMPLE_DEVICE_DATA: DeviceData[] = [
    { device: "mobile", views: 285, orders: 12, conversionRate: 4.2 },
    { device: "desktop", views: 142, orders: 14, conversionRate: 9.9 },
    { device: "tablet", views: 25, orders: 2, conversionRate: 8.0 },
  ]
  const SAMPLE_BROWSER_DATA = [
    { browser: "Chrome", views: 198 },
    { browser: "Safari", views: 165 },
    { browser: "Firefox", views: 45 },
    { browser: "Edge", views: 44 },
  ]
  const SAMPLE_TOP_PRODUCTS: TopProductData[] = [
    { id: "sp1", title: "Sample Pack Vol. 3", thumbnail_url: null, views: 142, orders: 12, revenue: 28800, conversionRate: 8.5 },
    { id: "sp2", title: "Beat Kit (50 beats)", thumbnail_url: null, views: 98, orders: 8, revenue: 39200, conversionRate: 8.2 },
    { id: "sp3", title: "Mix Template", thumbnail_url: null, views: 76, orders: 5, revenue: 0, conversionRate: 6.6 },
  ]
  const SAMPLE_COUNTRY_DATA: CountryData[] = [
    { code: "US", name: "United States", views: 198, orders: 11, revenue: 26800, conversionRate: 5.6 },
    { code: "GB", name: "United Kingdom", views: 87, orders: 5, revenue: 12200, conversionRate: 5.7 },
    { code: "CA", name: "Canada", views: 56, orders: 3, revenue: 7400, conversionRate: 5.4 },
    { code: "AU", name: "Australia", views: 42, orders: 3, revenue: 5800, conversionRate: 7.1 },
    { code: "DE", name: "Germany", views: 29, orders: 2, revenue: 4800, conversionRate: 6.9 },
  ]
  const displayTrafficSources = showSampleData && !hasRealData ? SAMPLE_TRAFFIC_SOURCES : trafficSources
  const displayTrafficPieData = displayTrafficSources.slice(0, 6).map(s => ({ name: formatSourceName(s.source), value: s.views }))
  const displayTotalTrafficViews = displayTrafficSources.reduce((sum, s) => sum + s.views, 0)
  const displayDeviceData = showSampleData && !hasRealData ? SAMPLE_DEVICE_DATA : deviceData
  const displayTotalDeviceViews = displayDeviceData.reduce((sum, d) => sum + d.views, 0)
  const displayBrowserData = showSampleData && !hasRealData ? SAMPLE_BROWSER_DATA : browserData
  const displayTotalBrowserViews = displayBrowserData.reduce((sum, b) => sum + b.views, 0)
  const displayTopProducts = showSampleData && !hasRealData ? SAMPLE_TOP_PRODUCTS : topProducts
  const displayCountryData = showSampleData && !hasRealData ? SAMPLE_COUNTRY_DATA : countryData

  // KPI Modal Chart component (matching Dashboard UI exactly)
  const KPIModalChart = ({ kpiType, label }: { kpiType: KPIType; label: string }) => {
    if (openKPIModal !== kpiType) return null

    return (
      <div onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-violet-600">{label}</span>
            <span className="text-[10px] text-[#9ca3af] hidden sm:inline">• {selectedTimeframeOption?.label}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }}
            className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {isKpiChartLoading ? (
          <div className="h-[80px] flex items-end gap-[2px]">
            {[35, 50, 25, 60, 40, 55, 30].map((h, i) => (
              <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                <div className="w-full rounded-sm bg-violet-200/60 animate-pulse" style={{ height: `${h}px` }} />
              </div>
            ))}
          </div>
        ) : !hasKpiChartData ? (
          <div className="h-[80px] flex items-center justify-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#d1d5db]" />
            <span className="text-[12px] text-[#9ca3af]">No data</span>
          </div>
        ) : (
          <div className="h-[80px] flex items-end gap-[2px]">
            {(() => {
              const displayData = kpiChartData.slice(-7)
              const maxValue = Math.max(...displayData.map((d) => d.value), 1)
              return displayData.map((point, index) => {
                const barHeight = Math.max((point.value / maxValue) * 65, 3)
                const displayValue = kpiType === "revenue" ? `$${point.value.toFixed(2)}` : point.value.toLocaleString()
                return (
                  <div key={index} className="flex-1 min-w-0 flex flex-col justify-end items-center group relative">
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                      {point.label}: {displayValue}
                    </div>
                    <div className="w-full rounded-sm bg-violet-400 hover:bg-violet-500 transition-colors cursor-pointer" style={{ height: `${barHeight}px` }} />
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[#fafafa]">
      {/* Announcement Bar — fixed above black header on mobile */}
      <AnnouncementBarMobile>
        <div className="max-w-[1200px] mx-auto flex items-center justify-center gap-2 md:gap-3 text-center">
          <span className="text-[12px] md:text-[14px] text-white/90">
            <span className="font-semibold text-white">Try Pro</span>
            <span className="hidden md:inline"> — our most popular plan for content creators and businesses.</span>
          </span>
          <Link
            href="/upgrade"
            className="relative inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-gray-900 to-black text-white text-[11px] md:text-[13px] font-medium rounded-full transition-all shrink-0 overflow-hidden group"
          >
            <span className="absolute inset-0 rounded-full border border-white/30 group-hover:border-white/50 transition-colors" />
            <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5 relative z-10" />
            <span className="relative z-10">Upgrade</span>
          </Link>
        </div>
      </AnnouncementBarMobile>

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        {isLoading ? (
          /* ── Full Page Skeleton ── */
          <div className="animate-pulse space-y-6">
            {/* Header skeleton */}
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <div className="h-8 w-32 bg-gray-100 rounded-lg" />
              <div className="flex sm:hidden h-9 w-40 bg-gray-100 rounded-full" />
            </div>

            {/* Timeframe + mode + product row skeleton */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="h-10 w-36 bg-gray-100 rounded-xl" />
              <div className="hidden sm:flex h-10 w-44 bg-gray-100 rounded-full" />
              <div className="h-10 w-40 bg-gray-100 rounded-xl" />
            </div>

            {/* KPI + Chart skeleton */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="flex overflow-hidden md:grid md:grid-cols-4 divide-x divide-[#e5e7eb]/60">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="px-3 py-3 sm:px-4 sm:py-3.5 flex-shrink-0 min-w-[130px] md:min-w-0">
                    <div className="h-3 w-16 bg-gray-100 rounded mb-2" />
                    <div className="h-6 w-20 bg-gray-100 rounded mb-1.5" />
                    <div className="h-2.5 w-24 bg-gray-50 rounded" />
                  </div>
                ))}
              </div>
              <div className="border-t border-[#e5e7eb]/60 px-4 py-4">
                <div className="h-[200px] flex items-end gap-2 px-2">
                  {[40, 55, 30, 65, 45, 60, 35, 50, 70, 42].map((h, i) => (
                    <div key={i} className="flex-1 bg-gray-50 rounded-t" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Traffic & Device Distribution skeleton */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-4 w-36 bg-gray-100 rounded" />
                  <div className="h-7 w-24 bg-gray-50 rounded-lg" />
                </div>
                <div className="h-[200px] flex items-center justify-center">
                  <div className="w-32 h-32 rounded-full bg-gray-50" />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-4 w-36 bg-gray-100 rounded" />
                  <div className="h-7 w-28 bg-gray-50 rounded-lg" />
                </div>
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-50 shrink-0" />
                      <div className="flex-1">
                        <div className="h-3 w-20 bg-gray-100 rounded mb-1.5" />
                        <div className="h-2 w-full bg-gray-50 rounded-full" />
                      </div>
                      <div className="h-4 w-10 bg-gray-50 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Products skeleton */}
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
              <div className="h-4 w-28 bg-gray-100 rounded mb-4" />
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-lg">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0" />
                    <div className="flex-1">
                      <div className="h-3.5 w-32 bg-gray-100 rounded mb-1.5" />
                      <div className="h-2.5 w-20 bg-gray-50 rounded" />
                    </div>
                    <div className="h-4 w-16 bg-gray-50 rounded" />
                  </div>
                ))}
              </div>
            </div>

            {/* Country skeleton */}
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
              <div className="h-4 w-36 bg-gray-100 rounded mb-4" />
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-4 bg-gray-100 rounded" />
                      <div className="h-3 w-24 bg-gray-100 rounded" />
                    </div>
                    <div className="flex gap-6">
                      <div className="h-3 w-10 bg-gray-50 rounded" />
                      <div className="h-3 w-8 bg-gray-50 rounded" />
                      <div className="h-3 w-12 bg-gray-50 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
        <>
        {/* Analytics title with Store/OnePage switcher on mobile */}
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">{t("analytics.title")}</h1>
          {/* Analytics Mode Switcher - visible next to title on mobile */}
          <div className="flex sm:hidden items-center bg-[#f3f4f6] rounded-full p-0.5">
            <button
              onClick={() => setAnalyticsMode("store")}
              className={`flex items-center gap-1.5 px-3 py-1 text-[12px] font-medium rounded-full transition-all duration-200 cursor-pointer ${
                analyticsMode === "store" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
              }`}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              {t("analytics.store")}
            </button>
            <button
              onClick={() => setAnalyticsMode("onepage")}
              className={`flex items-center gap-1.5 px-3 py-1 text-[12px] font-medium rounded-full transition-all duration-200 cursor-pointer ${
                analyticsMode === "onepage" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
              {t("nav.onepage")}
            </button>
          </div>
        </div>

        {/* Header with Timeframe, Mode Switcher, and Products */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Timeframe Dropdown - bottom sheet on mobile, dropdown on desktop */}
            <div className="relative timeframe-dropdown">
              <button
                onClick={() => {
                  triggerHaptic("light")
                  if (isMobile) {
                    setIsTimeframeSheetOpen(true)
                  } else {
                    setIsTimeframeOpen(!isTimeframeOpen)
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
              >
                {selectedTimeframeOption?.label || "Last 7 days"}
                <ChevronDown className={`h-4 w-4 text-[#9ca3af] transition-transform duration-200 ${isTimeframeOpen ? "rotate-180" : ""}`} />
              </button>
              {isTimeframeOpen && !isMobile && (
                <div className="absolute left-0 top-full mt-2 w-48 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1">
                  {timeframeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => { setTimeframe(option.value); setIsTimeframeOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                        timeframe === option.value ? "bg-[#f5f3ff] text-[#8b5cf6] font-medium" : "text-[#374151] hover:bg-[#f9fafb]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Analytics Mode Switcher - hidden on mobile (shown next to title instead) */}
            <div className="hidden sm:flex items-center bg-[#f3f4f6] rounded-full p-0.5">
              <button
                onClick={() => setAnalyticsMode("store")}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200 cursor-pointer ${
                  analyticsMode === "store" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
                }`}
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                {t("analytics.store")}
              </button>
              <button
                onClick={() => setAnalyticsMode("onepage")}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200 cursor-pointer ${
                  analyticsMode === "onepage" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
                }`}
              >
                <Link2 className="h-3.5 w-3.5" />
                {t("nav.onepage")}
              </button>
            </div>
          </div>

          {/* Products Dropdown - bottom sheet on mobile, dropdown on desktop */}
          {analyticsMode === "store" && (
            <div className="flex items-center gap-2">
              <div className="relative products-dropdown">
                <button
                  onClick={() => {
                    if (isMobile) {
                      setIsProductsSheetOpen(true)
                    } else {
                      setIsProductsOpen(!isProductsOpen)
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer max-w-[180px] sm:max-w-none"
                >
                  <span className="truncate">{selectedProduct === "all" ? "All products" : (() => { const title = products.find(p => p.id === selectedProduct)?.title || "All products"; return title.length > 11 ? title.slice(0, 11) + "..." : title })()}</span>
                  <ChevronDown className={`h-4 w-4 text-[#9ca3af] transition-transform duration-200 shrink-0 ${isProductsOpen ? "rotate-180" : ""}`} />
                </button>
                {isProductsOpen && !isMobile && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1 max-h-[300px] overflow-y-auto">
                    <button
                      onClick={() => { setSelectedProduct("all"); setIsProductsOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                        selectedProduct === "all" ? "bg-[#f5f3ff] text-[#8b5cf6] font-medium" : "text-[#374151] hover:bg-[#f9fafb]"
                      }`}
                    >
                      All products
                    </button>
                    {products.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedProduct(p.id); setIsProductsOpen(false) }}
                        className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors truncate ${
                          selectedProduct === p.id ? "bg-[#f5f3ff] text-[#8b5cf6] font-medium" : "text-[#374151] hover:bg-[#f9fafb]"
                        }`}
                      >
                        {p.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Custom date range */}
        {timeframe === "custom" && (
          <div className="flex gap-4 flex-col sm:flex-row sm:items-end p-4 bg-white rounded-xl border border-[#e5e7eb]">
            <div className="flex-1 max-w-[180px] space-y-1.5">
              <Label className="text-xs text-[#6b7280]">Start Date</Label>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9" />
            </div>
            <div className="flex-1 max-w-[180px] space-y-1.5">
              <Label className="text-xs text-[#6b7280]">End Date</Label>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9" />
            </div>
            <Button onClick={handleCustomRangeApply} disabled={!customStart || !customEnd} size="sm" className="h-9 bg-[#8b5cf6] hover:bg-[#7c3aed]">
              Apply Range
            </Button>
          </div>
        )}

        {/* Unified KPI Tabs + Chart Card */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          {/* KPI Metric Tabs */}
          <div className="relative flex overflow-x-auto scrollbar-hide md:grid md:grid-cols-4 divide-x divide-[#e5e7eb]/60" style={{ touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}>
            {analyticsMode === "store" ? (
              <>
                {/* Views */}
                <button
                  className={`text-left px-3 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 cursor-pointer relative flex-shrink-0 min-w-[130px] md:min-w-0 ${
                    chartMetricFilter === "views" ? "md:bg-[#f9fafb]" : "hover:bg-[#fafafa]"
                  }`}
                  onClick={() => setChartMetricFilter("views")}
                >
                  {chartMetricFilter === "views" && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#d1d5db]" />}
                  <span className={`text-[11px] sm:text-[12px] font-medium ${chartMetricFilter === "views" ? "text-[#374151]" : "text-[#6b7280]"}`}>{t("analytics.totalViews")}</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className={`text-[18px] sm:text-[22px] font-semibold tracking-tight transition-all duration-300 ${showSampleData && !hasRealData ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]"} ${isRefreshing ? "blur-[2px]" : "blur-0"}`}>{formatCompactNumber(displaySummary.totalViews)}</span>
                    {<PercentChangeIndicator current={displaySummary.totalViews} previous={displaySummary.prevPeriodViews} />}
                  </div>
                  <p className={`text-[10px] sm:text-[11px] text-[#9ca3af] whitespace-nowrap transition-all duration-300 ${isRefreshing ? "blur-[1px]" : "blur-0"}`}>{formatCompactNumber(displaySummary.allTimeViews)} {t("dashboard.allTime")}</p>
                </button>
                {/* Revenue */}
                <button
                  className={`text-left px-3 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 cursor-pointer relative flex-shrink-0 min-w-[130px] md:min-w-0 ${
                    chartMetricFilter === "revenue" ? "md:bg-[#f9fafb]" : "hover:bg-[#fafafa]"
                  }`}
                  onClick={() => setChartMetricFilter("revenue")}
                >
                  {chartMetricFilter === "revenue" && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#d1d5db]" />}
                  <span className={`text-[11px] sm:text-[12px] font-medium ${chartMetricFilter === "revenue" ? "text-[#374151]" : "text-[#6b7280]"}`}>{t("analytics.totalRevenue")}</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className={`text-[18px] sm:text-[22px] font-semibold tracking-tight transition-all duration-300 ${showSampleData && !hasRealData ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]"} ${isRefreshing ? "blur-[2px]" : "blur-0"}`}>{formatPrice(displaySummary.totalRevenue)}</span>
                    {<PercentChangeIndicator current={displaySummary.totalRevenue} previous={displaySummary.prevPeriodRevenue} />}
                  </div>
                  <p className={`text-[10px] sm:text-[11px] text-[#9ca3af] whitespace-nowrap transition-all duration-300 ${isRefreshing ? "blur-[1px]" : "blur-0"}`}>{formatPrice(displaySummary.allTimeRevenue)} {t("dashboard.allTime")}</p>
                </button>
                {/* Orders */}
                <button
                  className={`text-left px-3 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 cursor-pointer relative flex-shrink-0 min-w-[130px] md:min-w-0 ${
                    chartMetricFilter === "orders" ? "md:bg-[#f9fafb]" : "hover:bg-[#fafafa]"
                  }`}
                  onClick={() => setChartMetricFilter("orders")}
                >
                  {chartMetricFilter === "orders" && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#d1d5db]" />}
                  <span className={`text-[11px] sm:text-[12px] font-medium ${chartMetricFilter === "orders" ? "text-[#374151]" : "text-[#6b7280]"}`}>{t("analytics.totalOrders")}</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className={`text-[18px] sm:text-[22px] font-semibold tracking-tight transition-all duration-300 ${showSampleData && !hasRealData ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]"} ${isRefreshing ? "blur-[2px]" : "blur-0"}`}>{formatCompactNumber(displaySummary.totalOrders)}</span>
                    {<PercentChangeIndicator current={displaySummary.totalOrders} previous={displaySummary.prevPeriodOrders} />}
                  </div>
                  <p className={`text-[10px] sm:text-[11px] text-[#9ca3af] whitespace-nowrap transition-all duration-300 ${isRefreshing ? "blur-[1px]" : "blur-0"}`}>{formatCompactNumber(displaySummary.allTimeOrders)} {t("dashboard.allTime")}</p>
                </button>
                {/* Conversion */}
                <button
                  className={`text-left px-3 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 cursor-pointer relative flex-shrink-0 min-w-[130px] md:min-w-0 ${
                    chartMetricFilter === "conversion" ? "md:bg-[#f9fafb]" : "hover:bg-[#fafafa]"
                  }`}
                  onClick={() => setChartMetricFilter("conversion")}
                >
                  {chartMetricFilter === "conversion" && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#d1d5db]" />}
                  <span className={`text-[11px] sm:text-[12px] font-medium ${chartMetricFilter === "conversion" ? "text-[#374151]" : "text-[#6b7280]"}`}>{t("analytics.conversionRate")}</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className={`text-[18px] sm:text-[22px] font-semibold tracking-tight transition-all duration-300 ${showSampleData && !hasRealData ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]"} ${isRefreshing ? "blur-[2px]" : "blur-0"}`}>{Math.round(displaySummary.conversionRate)}%</span>
                  </div>
                  <p className={`text-[10px] sm:text-[11px] text-[#9ca3af] whitespace-nowrap transition-all duration-300 ${isRefreshing ? "blur-[1px]" : "blur-0"}`}>{t("dashboard.viewsToOrders")}</p>
                </button>
              </>
            ) : (
              <>
                {/* OnePage Views */}
                <button
                  className={`text-left px-3 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 cursor-pointer relative flex-shrink-0 min-w-[130px] md:min-w-0 ${
                    onePageChartFilter === "views" ? "md:bg-[#f9fafb]" : "hover:bg-[#fafafa]"
                  }`}
                  onClick={() => setOnePageChartFilter("views")}
                >
                  {onePageChartFilter === "views" && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#d1d5db]" />}
                  <span className={`text-[11px] sm:text-[12px] font-medium ${onePageChartFilter === "views" ? "text-[#374151]" : "text-[#6b7280]"}`}>{t("dashboard.views")}</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className={`text-[18px] sm:text-[22px] font-semibold tracking-tight transition-all duration-300 ${showSampleData && !hasRealData ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]"} ${isRefreshing ? "blur-[2px]" : "blur-0"}`}>{formatCompactNumber(displayOnePageMetrics.views)}</span>
                    {<PercentChangeIndicator current={displayOnePageMetrics.views} previous={displayOnePageMetrics.prevViews} />}
                  </div>
                  <p className={`text-[10px] sm:text-[11px] text-[#9ca3af] whitespace-nowrap transition-all duration-300 ${isRefreshing ? "blur-[1px]" : "blur-0"}`}>{formatCompactNumber(displayOnePageMetrics.allTimeViews)} {t("dashboard.allTime")}</p>
                </button>
                {/* Clicks */}
                <button
                  className={`text-left px-3 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 cursor-pointer relative flex-shrink-0 min-w-[130px] md:min-w-0 ${
                    onePageChartFilter === "clicks" ? "md:bg-[#f9fafb]" : "hover:bg-[#fafafa]"
                  }`}
                  onClick={() => setOnePageChartFilter("clicks")}
                >
                  {onePageChartFilter === "clicks" && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#d1d5db]" />}
                  <span className={`text-[11px] sm:text-[12px] font-medium ${onePageChartFilter === "clicks" ? "text-[#374151]" : "text-[#6b7280]"}`}>{t("analytics.clicks")}</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className={`text-[18px] sm:text-[22px] font-semibold tracking-tight transition-all duration-300 ${showSampleData && !hasRealData ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]"} ${isRefreshing ? "blur-[2px]" : "blur-0"}`}>{formatCompactNumber(displayOnePageMetrics.clicks)}</span>
                    {<PercentChangeIndicator current={displayOnePageMetrics.clicks} previous={displayOnePageMetrics.prevClicks} />}
                  </div>
                  <p className={`text-[10px] sm:text-[11px] text-[#9ca3af] whitespace-nowrap transition-all duration-300 ${isRefreshing ? "blur-[1px]" : "blur-0"}`}>{formatCompactNumber(displayOnePageMetrics.allTimeClicks)} {t("dashboard.allTime")}</p>
                </button>
                {/* Subscribers */}
                <button
                  className={`text-left px-3 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 cursor-pointer relative flex-shrink-0 min-w-[130px] md:min-w-0 ${
                    onePageChartFilter === "subscribers" ? "md:bg-[#f9fafb]" : "hover:bg-[#fafafa]"
                  }`}
                  onClick={() => setOnePageChartFilter("subscribers")}
                >
                  {onePageChartFilter === "subscribers" && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#d1d5db]" />}
                  <span className={`text-[11px] sm:text-[12px] font-medium ${onePageChartFilter === "subscribers" ? "text-[#374151]" : "text-[#6b7280]"}`}>{t("analytics.subscribers")}</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className={`text-[18px] sm:text-[22px] font-semibold tracking-tight transition-all duration-300 ${showSampleData && !hasRealData ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]"} ${isRefreshing ? "blur-[2px]" : "blur-0"}`}>{formatCompactNumber(displayOnePageMetrics.subscribers)}</span>
                    {<PercentChangeIndicator current={displayOnePageMetrics.subscribers} previous={displayOnePageMetrics.prevSubscribers} />}
                  </div>
                  <p className={`text-[10px] sm:text-[11px] text-[#9ca3af] whitespace-nowrap transition-all duration-300 ${isRefreshing ? "blur-[1px]" : "blur-0"}`}>{formatCompactNumber(displayOnePageMetrics.allTimeSubscribers)} {t("dashboard.allTime")}</p>
                </button>
                {/* CTR */}
                <button
                  className={`text-left px-3 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 cursor-pointer relative flex-shrink-0 min-w-[130px] md:min-w-0 ${
                    onePageChartFilter === "ctr" ? "md:bg-[#f9fafb]" : "hover:bg-[#fafafa]"
                  }`}
                  onClick={() => setOnePageChartFilter("ctr")}
                >
                  {onePageChartFilter === "ctr" && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#d1d5db]" />}
                  <span className={`text-[11px] sm:text-[12px] font-medium ${onePageChartFilter === "ctr" ? "text-[#374151]" : "text-[#6b7280]"}`}>CTR</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className={`text-[18px] sm:text-[22px] font-semibold tracking-tight transition-all duration-300 ${showSampleData && !hasRealData ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]"} ${isRefreshing ? "blur-[2px]" : "blur-0"}`}>{Math.round(displayOnePageMetrics.ctr)}%</span>
                  </div>
                  <p className={`text-[10px] sm:text-[11px] text-[#9ca3af] whitespace-nowrap transition-all duration-300 ${isRefreshing ? "blur-[1px]" : "blur-0"}`}>{t("analytics.clicksToViews")}</p>
                </button>
              </>
            )}
          </div>

          {/* Chart Area - always open */}
          <div className="border-t border-[#e5e7eb]/60 px-2 py-3 sm:px-4 sm:py-4">
            {(
              <div className="relative">
                <div
                  ref={chartContainerRef}
                  className={`transition-all duration-500 ease-out ${showSampleData && !hasRealData ? "opacity-50" : "opacity-100"} ${isRefreshing ? "opacity-30 blur-[2px]" : "blur-0"}`}
                  style={{
                    touchAction: chartTooltipActive ? "none" : "pan-y pinch-zoom",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    WebkitTouchCallout: "none",
                    position: "relative",
                  } as React.CSSProperties}
                  onTouchStart={(e) => {
                    const touch = e.touches[0]
                    chartTouchStartRef.current = { x: touch.clientX, y: touch.clientY }
                    chartDirectionLockRef.current = null
                    chartLongPressTimerRef.current = setTimeout(() => {
                      // Long press fallback — if no movement detected, activate scrub
                      if (chartDirectionLockRef.current === null) {
                        chartDirectionLockRef.current = "horizontal"
                        chartTooltipActiveRef.current = true
                        setChartTooltipActive(true)
                        const el = chartContainerRef.current
                        if (el && chartDisplayData.length) {
                          const rect = el.getBoundingClientRect()
                          const chartLeft = rect.left + 40
                          const chartWidth = rect.right - 4 - chartLeft
                          const ratio = Math.max(0, Math.min(1, (touch.clientX - chartLeft) / chartWidth))
                          setChartActiveIndex(Math.round(ratio * (chartDisplayData.length - 1)))
                        }
                        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(15)
                      }
                    }, 250)
                  }}
                  onTouchEnd={() => {
                    if (chartLongPressTimerRef.current) { clearTimeout(chartLongPressTimerRef.current); chartLongPressTimerRef.current = null }
                    if (chartRafRef.current) { cancelAnimationFrame(chartRafRef.current); chartRafRef.current = null }
                    chartTouchStartRef.current = null
                    chartDirectionLockRef.current = null
                    chartTooltipActiveRef.current = false
                    setChartTooltipActive(false)
                    setChartActiveIndex(null)
                  }}
                  onTouchCancel={() => {
                    if (chartLongPressTimerRef.current) { clearTimeout(chartLongPressTimerRef.current); chartLongPressTimerRef.current = null }
                    if (chartRafRef.current) { cancelAnimationFrame(chartRafRef.current); chartRafRef.current = null }
                    chartTouchStartRef.current = null
                    chartDirectionLockRef.current = null
                    chartTooltipActiveRef.current = false
                    setChartTooltipActive(false)
                    setChartActiveIndex(null)
                  }}
                >
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartDisplayData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.views} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={CHART_COLORS.views} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.orders} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={CHART_COLORS.orders} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.revenue} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={CHART_COLORS.revenue} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradRefunds" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.refunds} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={CHART_COLORS.refunds} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradConversion" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradClicks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.clicks} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={CHART_COLORS.clicks} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradSubscribers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradCtr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} domain={[0, "auto"]} width={40}
                    tickFormatter={(v) => (chartMetricFilter === "conversion" || onePageChartFilter === "ctr") ? `${v}%` : v.toLocaleString()}
                  />
                  {/* Desktop-only Recharts tooltip — hidden on touch devices */}
                  {!isTouchDevice && (
                    <Tooltip
                      cursor={{ stroke: "#c4b5fd", strokeWidth: 1, strokeDasharray: "4 2" }}
                      isAnimationActive={false}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const lines: { label: string; value: string; color?: string }[] = []
                        payload.forEach((p: any) => {
                          const name = p.dataKey as string
                          const val = p.value as number
                          const labels: Record<string, string> = { views: "Views", clicks: "Clicks", sales: "Orders", revenue: "Revenue", subscribers: "Subscribers", conversion: "Conversion", ctr: "CTR", refunds: "Refunds" }
                          const displayLabel = labels[name] || name
                          let displayVal: string
                          if (name === "revenue") displayVal = formatPrice(val)
                          else if (name === "conversion" || name === "ctr") displayVal = `${val}%`
                          else displayVal = val.toLocaleString()
                          lines.push({ label: displayLabel, value: displayVal })
                        })
                        return (
                          <div style={{ background: "#1a1a2e", border: "none", borderRadius: "8px", fontSize: "12px", color: "#fff", padding: "8px 12px", pointerEvents: "none" }}>
                            <p style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "2px" }}>{label}</p>
                            {lines.map((l, i) => (
                              <p key={i} style={{ fontWeight: 500, color: l.label === "Refunds" ? CHART_COLORS.refunds : undefined }}>{l.label}: {l.value}</p>
                            ))}
                          </div>
                        )
                      }}
                    />
                  )}
                  {/* Vertical crosshair line at active touch point */}
                  {chartTooltipActive && chartActiveIndex != null && chartActiveIndex >= 0 && chartActiveIndex < chartDisplayData.length && (
                    <ReferenceLine x={chartDisplayData[chartActiveIndex].date} stroke="#c4b5fd" strokeWidth={1} strokeDasharray="4 3" />
                  )}
                  {/* Store areas */}
                  {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "views") && (
                    <Area type="monotone" dataKey="views" stroke={CHART_COLORS.views} strokeWidth={2} fill="url(#gradViews)" dot={(p: any) => chartTooltipActive && p.index === chartActiveIndex ? <circle key={p.index} cx={p.cx} cy={p.cy} r={6} fill={CHART_COLORS.views} stroke="#fff" strokeWidth={2.5} style={{ filter: "drop-shadow(0 1px 3px rgba(139,92,246,0.4))" }} /> : <circle key={p.index} r={0} cx={0} cy={0} fill="none" stroke="none" />} activeDot={!isTouchDevice ? { r: 4, fill: CHART_COLORS.views, strokeWidth: 2, stroke: "#fff" } : false} name="views" isAnimationActive={chartShouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={0} />
                  )}
                  {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "orders") && (
                    <Area type="monotone" dataKey="sales" stroke={CHART_COLORS.orders} strokeWidth={2} fill="url(#gradOrders)" dot={(p: any) => chartTooltipActive && p.index === chartActiveIndex ? <circle key={p.index} cx={p.cx} cy={p.cy} r={6} fill={CHART_COLORS.orders} stroke="#fff" strokeWidth={2.5} style={{ filter: "drop-shadow(0 1px 3px rgba(139,92,246,0.4))" }} /> : <circle key={p.index} r={0} cx={0} cy={0} fill="none" stroke="none" />} activeDot={!isTouchDevice ? { r: 4, fill: CHART_COLORS.orders, strokeWidth: 2, stroke: "#fff" } : false} name="sales" isAnimationActive={chartShouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={0} />
                  )}
                  {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "orders" || chartMetricFilter === "revenue") && (
                    <Area type="monotone" dataKey="refunds" stroke={CHART_COLORS.refunds} strokeWidth={2} fill="url(#gradRefunds)" dot={(p: any) => chartTooltipActive && p.index === chartActiveIndex ? <circle key={p.index} cx={p.cx} cy={p.cy} r={6} fill={CHART_COLORS.refunds} stroke="#fff" strokeWidth={2.5} /> : <circle key={p.index} r={0} cx={0} cy={0} fill="none" stroke="none" />} activeDot={!isTouchDevice ? { r: 4, fill: CHART_COLORS.refunds, strokeWidth: 2, stroke: "#fff" } : false} name="refunds" isAnimationActive={chartShouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={0} />
                  )}
                  {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "revenue") && (
                    <Area type="monotone" dataKey="revenue" stroke={CHART_COLORS.revenue} strokeWidth={2} fill="url(#gradRevenue)" dot={(p: any) => chartTooltipActive && p.index === chartActiveIndex ? <circle key={p.index} cx={p.cx} cy={p.cy} r={6} fill={CHART_COLORS.revenue} stroke="#fff" strokeWidth={2.5} style={{ filter: "drop-shadow(0 1px 3px rgba(59,130,246,0.4))" }} /> : <circle key={p.index} r={0} cx={0} cy={0} fill="none" stroke="none" />} activeDot={!isTouchDevice ? { r: 4, fill: CHART_COLORS.revenue, strokeWidth: 2, stroke: "#fff" } : false} name="revenue" isAnimationActive={chartShouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={0} />
                  )}
                  {analyticsMode === "store" && chartMetricFilter === "conversion" && (
                    <Area type="monotone" dataKey="conversion" stroke="#10b981" strokeWidth={2} fill="url(#gradConversion)" dot={(p: any) => chartTooltipActive && p.index === chartActiveIndex ? <circle key={p.index} cx={p.cx} cy={p.cy} r={6} fill="#10b981" stroke="#fff" strokeWidth={2.5} /> : <circle key={p.index} r={0} cx={0} cy={0} fill="none" stroke="none" />} activeDot={!isTouchDevice ? { r: 4, fill: "#10b981", strokeWidth: 2, stroke: "#fff" } : false} name="conversion" isAnimationActive={chartShouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={0} />
                  )}
                  {/* OnePage areas */}
                  {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "views") && (
                    <Area type="monotone" dataKey="views" stroke={CHART_COLORS.views} strokeWidth={2} fill="url(#gradViews)" dot={(p: any) => chartTooltipActive && p.index === chartActiveIndex ? <circle key={p.index} cx={p.cx} cy={p.cy} r={6} fill={CHART_COLORS.views} stroke="#fff" strokeWidth={2.5} style={{ filter: "drop-shadow(0 1px 3px rgba(139,92,246,0.4))" }} /> : <circle key={p.index} r={0} cx={0} cy={0} fill="none" stroke="none" />} activeDot={!isTouchDevice ? { r: 4, fill: CHART_COLORS.views, strokeWidth: 2, stroke: "#fff" } : false} name="views" connectNulls isAnimationActive={chartShouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={0} />
                  )}
                  {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "clicks") && (
                    <Area type="monotone" dataKey="clicks" stroke={CHART_COLORS.clicks} strokeWidth={2} fill="url(#gradClicks)" dot={(p: any) => chartTooltipActive && p.index === chartActiveIndex ? <circle key={p.index} cx={p.cx} cy={p.cy} r={6} fill={CHART_COLORS.clicks} stroke="#fff" strokeWidth={2.5} /> : <circle key={p.index} r={0} cx={0} cy={0} fill="none" stroke="none" />} activeDot={!isTouchDevice ? { r: 4, fill: CHART_COLORS.clicks, strokeWidth: 2, stroke: "#fff" } : false} name="clicks" connectNulls isAnimationActive={chartShouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={0} />
                  )}
                  {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "subscribers") && (
                    <Area type="monotone" dataKey="subscribers" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradSubscribers)" dot={(p: any) => chartTooltipActive && p.index === chartActiveIndex ? <circle key={p.index} cx={p.cx} cy={p.cy} r={6} fill="#8b5cf6" stroke="#fff" strokeWidth={2.5} /> : <circle key={p.index} r={0} cx={0} cy={0} fill="none" stroke="none" />} activeDot={!isTouchDevice ? { r: 4, fill: "#8b5cf6", strokeWidth: 2, stroke: "#fff" } : false} name="subscribers" connectNulls isAnimationActive={chartShouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={0} />
                  )}
                  {analyticsMode === "onepage" && onePageChartFilter === "ctr" && (
                    <Area type="monotone" dataKey="ctr" stroke="#f59e0b" strokeWidth={2} fill="url(#gradCtr)" dot={(p: any) => chartTooltipActive && p.index === chartActiveIndex ? <circle key={p.index} cx={p.cx} cy={p.cy} r={6} fill="#f59e0b" stroke="#fff" strokeWidth={2.5} /> : <circle key={p.index} r={0} cx={0} cy={0} fill="none" stroke="none" />} activeDot={!isTouchDevice ? { r: 4, fill: "#f59e0b", strokeWidth: 2, stroke: "#fff" } : false} name="ctr" connectNulls isAnimationActive={chartShouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={0} />
                  )}
                </AreaChart>
              </ResponsiveContainer>

              {/* Custom tooltip for touch — inside chart area at fixed top */}
              {chartTooltipActive && chartActiveIndex != null && chartActiveIndex >= 0 && chartActiveIndex < chartDisplayData.length && (() => {
                const pt = chartDisplayData[chartActiveIndex]
                const leftPct = chartDisplayData.length > 1 ? (chartActiveIndex / (chartDisplayData.length - 1)) * 100 : 50
                // Dynamic clamping based on tooltip width
                let clampedLeft = Math.max(12, Math.min(88, leftPct))
                const tooltipEl = chartTooltipRef.current
                const containerEl = chartContainerRef.current
                if (tooltipEl && containerEl) {
                  const halfPct = (tooltipEl.offsetWidth / 2 / containerEl.offsetWidth) * 100
                  clampedLeft = Math.max(halfPct + 2, Math.min(100 - halfPct - 2, leftPct))
                }
                const metricLabels: Record<string, string> = { views: "Views", clicks: "Clicks", sales: "Orders", revenue: "Revenue", subscribers: "Subscribers", conversion: "Conversion", ctr: "CTR", refunds: "Refunds" }
                const lines: { label: string; value: string; isRefund?: boolean }[] = []
                const addLine = (key: string, val: number | undefined) => {
                  if (val == null) return
                  const displayLabel = metricLabels[key] || key
                  let displayVal: string
                  if (key === "revenue") displayVal = formatPrice(val)
                  else if (key === "conversion" || key === "ctr") displayVal = `${val}%`
                  else displayVal = val.toLocaleString()
                  lines.push({ label: displayLabel, value: displayVal, isRefund: key === "refunds" })
                }
                if (analyticsMode === "store") {
                  if (chartMetricFilter === "all" || chartMetricFilter === "views") addLine("views", pt.views)
                  if (chartMetricFilter === "all" || chartMetricFilter === "orders") addLine("sales", pt.sales)
                  if ((chartMetricFilter === "all" || chartMetricFilter === "orders" || chartMetricFilter === "revenue") && pt.refunds) addLine("refunds", pt.refunds)
                  if (chartMetricFilter === "all" || chartMetricFilter === "revenue") addLine("revenue", pt.revenue)
                  if (chartMetricFilter === "conversion") addLine("conversion", (pt as any).conversion)
                } else {
                  if (onePageChartFilter === "all" || onePageChartFilter === "views") addLine("views", pt.views)
                  if (onePageChartFilter === "all" || onePageChartFilter === "clicks") addLine("clicks", pt.clicks)
                  if (onePageChartFilter === "all" || onePageChartFilter === "subscribers") addLine("subscribers", pt.subscribers)
                  if (onePageChartFilter === "ctr") addLine("ctr", (pt as any).ctr)
                }
                return (
                  <div ref={chartTooltipRef} style={{
                    position: "absolute",
                    top: 8,
                    left: `${clampedLeft}%`,
                    transform: "translateX(-50%)",
                    background: "#1a1a2e",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#fff",
                    padding: "6px 12px",
                    pointerEvents: "none",
                    zIndex: 10,
                    whiteSpace: "nowrap",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    willChange: "left",
                    transition: "left 50ms linear",
                  }}>
                    <p style={{ fontSize: "11px", color: "#9ca3af", margin: 0, marginBottom: "2px" }}>{pt.date}</p>
                    {lines.map((l, i) => (
                      <p key={i} style={{ fontWeight: 500, margin: 0, color: l.isRefund ? CHART_COLORS.refunds : undefined }}>{l.label}: {l.value}</p>
                    ))}
                  </div>
                )
              })()}
                </div>
                {!hasRealData && (
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                    <span className="text-[11px] text-[#c8ccd4]">
                      {showSampleData ? "Sample data" : "No activity yet"}
                    </span>
                    <button
                      onClick={() => setShowSampleData(prev => !prev)}
                      className={`relative inline-flex h-4 w-7 rounded-full transition-colors cursor-pointer ${showSampleData ? "bg-indigo-300/80" : "bg-[#e9ecef]"}`}
                      aria-label={showSampleData ? "Hide sample data" : "Show sample data"}
                    >
                      <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm my-0.5 transition-transform ${showSampleData ? "translate-x-3.5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Traffic & Device Distribution */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className={`border-[#e5e7eb] bg-white transition-opacity duration-300 ${showSampleData && !hasRealData ? "opacity-60" : ""}`}>
            <CardHeader className="pb-0 pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">Traffic Distribution</CardTitle>
                  {showSampleData && !hasRealData && <span className="text-[10px] font-medium text-indigo-400/80 bg-indigo-50 px-2 py-0.5 rounded-full">Sample</span>}
                </div>
                <div className="flex items-center bg-[#f3f4f6] rounded-lg p-0.5">
                  <button
                    onClick={() => setTrafficViewMode("chart")}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200 ${trafficViewMode === "chart" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"}`}
                  >
                    Chart
                  </button>
                  <button
                    onClick={() => setTrafficViewMode("list")}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200 ${trafficViewMode === "list" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"}`}
                  >
                    Sources
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {displayTrafficPieData.length > 0 ? (
                <div className="relative">
                  <div className={`transition-all duration-300 ease-out ${trafficViewMode === "chart" ? "opacity-100 h-auto" : "opacity-0 h-0 overflow-hidden absolute inset-0"}`}>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={displayTrafficPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value" animationBegin={0} animationDuration={600}>
                            {displayTrafficPieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number, name: string) => [`${value.toLocaleString()} views`, name]}
                            contentStyle={{ backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "12px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                            labelFormatter={() => ""}
                          />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} formatter={(value) => <span className="text-[11px] text-[#6b7280]">{value}</span>} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className={`transition-all duration-300 ease-out ${trafficViewMode === "list" ? "opacity-100 h-auto" : "opacity-0 h-0 overflow-hidden absolute inset-0"}`}>
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                      {displayTrafficSources.slice(0, 10).map((source, idx) => {
                        const percentage = displayTotalTrafficViews > 0 ? (source.views / displayTotalTrafficViews) * 100 : 0
                        return (
                          <div key={source.source} className="flex items-center gap-3 p-2 bg-[#f9fafb] rounded-lg">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${PIE_COLORS[idx % PIE_COLORS.length]}15` }}>
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-[13px] font-medium text-[#1a1a2e]">{formatSourceName(source.source)}</span>
                            </div>
                            <span className="text-[12px] text-[#6b7280] shrink-0">{source.views.toLocaleString()} views</span>
                            <span className="text-[12px] font-semibold text-[#1a1a2e] shrink-0 w-12 text-right">{percentage.toFixed(1)}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center">
                  <p className="text-[#9ca3af] text-[13px]">No traffic data</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={`border-[#e5e7eb] bg-white transition-opacity duration-300 ${showSampleData && !hasRealData ? "opacity-60" : ""}`}>
            <CardHeader className="pb-0 pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">
                    {deviceTabMode === "device" ? "Device Breakdown" : "Browser Breakdown"}
                  </CardTitle>
                  {showSampleData && !hasRealData && <span className="text-[10px] font-medium text-indigo-400/80 bg-indigo-50 px-2 py-0.5 rounded-full">Sample</span>}
                </div>
                <div className="flex items-center bg-[#f3f4f6] rounded-lg p-0.5">
                  <button
                    onClick={() => setDeviceTabMode("device")}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200 ${deviceTabMode === "device" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"}`}
                  >
                    Devices
                  </button>
                  <button
                    onClick={() => setDeviceTabMode("browser")}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200 ${deviceTabMode === "browser" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"}`}
                  >
                    Browsers
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
                <div className="transition-opacity duration-300 ease-out" key={deviceTabMode}>
                  {deviceTabMode === "device" ? (
                    displayDeviceData.length > 0 ? (
                      <div className="space-y-2">
                        {displayDeviceData.map((device) => {
                          const percentage = displayTotalDeviceViews > 0 ? (device.views / displayTotalDeviceViews) * 100 : 0
                          return (
                            <div key={device.device} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-lg">
                              <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shadow-sm">
                                {getDeviceIcon(device.device)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-[13px] font-medium text-[#1a1a2e]">{formatDeviceName(device.device)}</span>
                                  <span className="text-[13px] font-semibold text-[#1a1a2e]">{percentage.toFixed(0)}%</span>
                                </div>
                                <p className="text-[11px] text-[#9ca3af]">{device.views.toLocaleString()} views</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="h-[200px] flex items-center justify-center">
                        <p className="text-[#9ca3af] text-[13px]">No device data</p>
                      </div>
                    )
                  ) : (
                    displayBrowserData.length > 0 ? (
                      <div className="space-y-2">
                        {displayBrowserData.map((browser) => {
                          const percentage = displayTotalBrowserViews > 0 ? (browser.views / displayTotalBrowserViews) * 100 : 0
                          return (
                            <div key={browser.browser} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-lg">
                              <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shadow-sm">
                                {getBrowserIcon(browser.browser)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-[13px] font-medium text-[#1a1a2e]">{browser.browser}</span>
                                  <span className="text-[13px] font-semibold text-[#1a1a2e]">{percentage.toFixed(0)}%</span>
                                </div>
                                <p className="text-[11px] text-[#9ca3af]">{browser.views.toLocaleString()} views</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="h-[200px] flex items-center justify-center">
                        <p className="text-[#9ca3af] text-[13px]">No browser data</p>
                      </div>
                    )
                  )}
                </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Products / Most Clicked */}
        <Card className={`border-[#e5e7eb] bg-white transition-opacity duration-300 ${showSampleData && !hasRealData ? "opacity-60" : ""}`}>
          <CardHeader className="pb-0 pt-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">
                {analyticsMode === "store" ? "Top Products" : "Most Clicked"}
              </CardTitle>
              {showSampleData && !hasRealData && analyticsMode === "store" && <span className="text-[10px] font-medium text-indigo-400/80 bg-indigo-50 px-2 py-0.5 rounded-full">Sample</span>}
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {analyticsMode === "store" ? (
              displayTopProducts.length > 0 ? (
                <div className="space-y-2">
                  {displayTopProducts.slice(0, 5).map((product, idx) => (
                    <div key={product.id} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-lg hover:bg-[#f3f4f6] transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-[#e5e7eb] flex items-center justify-center overflow-hidden flex-shrink-0">
                        {product.thumbnail_url ? (
                          <img
                            src={product.thumbnail_url}
                            alt={product.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback if image fails to load
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                              if (target.nextSibling) {
                                (target.nextSibling as HTMLElement).style.display = 'flex'
                              }
                            }}
                          />
                        ) : null}
                        <span className={`text-lg ${product.thumbnail_url ? 'hidden' : 'flex'}`}>📦</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#1a1a2e] truncate">{product.title}</p>
                        <p className="text-[11px] text-[#9ca3af]">{product.views.toLocaleString()} views • {product.orders} orders</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[13px] font-semibold text-[#1a1a2e]">{formatPrice(product.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-[#9ca3af] text-[13px]">No product data</p>
                </div>
              )
            ) : mostClickedBlocks.length > 0 ? (
              <div className="space-y-2">
                {(showAllMostClicked ? mostClickedBlocks : mostClickedBlocks.slice(0, 5)).map((block, index) => {
                  // Format display URL - hide Supabase storage URLs and clean up display
                  const url = block.url || ""
                  const isSupabaseUrl = url.includes('supabase.co/storage')
                  const isPdfUrl = url.toLowerCase().endsWith('.pdf')

                  // Determine friendly display URL
                  let displayUrl = url
                  if (isSupabaseUrl || isPdfUrl) {
                    displayUrl = block.blockType === 'pdf_document' || block.blockType === 'food_menu'
                      ? 'PDF Document'
                      : 'Digital Download'
                  } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                    displayUrl = 'youtube.com'
                  } else if (url.includes('spotify.com')) {
                    displayUrl = 'spotify.com'
                  } else if (url.includes('soundcloud.com')) {
                    displayUrl = 'soundcloud.com'
                  } else if (url.includes('apple.com/music') || url.includes('music.apple.com')) {
                    displayUrl = 'music.apple.com'
                  } else if (url.includes('calendly.com')) {
                    displayUrl = 'calendly.com'
                  } else if (url.length > 40) {
                    // Truncate long URLs
                    try {
                      const urlObj = new URL(url)
                      displayUrl = urlObj.hostname
                    } catch {
                      displayUrl = url.slice(0, 40) + '...'
                    }
                  }

                  // Get SVG icon component based on block icon, URL, or type
                  const getBlockIconComponent = () => {
                    const iconClass = "h-5 w-5"
                    const iconLower = (block.icon || "").toLowerCase().trim()

                    // Check text-based icon names first - use brand icons for platforms
                    if (iconLower.includes('spotify')) {
                      return <SpotifyIcon className={`${iconClass} text-[#1DB954]`} />
                    }
                    if (iconLower.includes('youtube')) {
                      return <YoutubeIcon className={iconClass} />
                    }
                    if (iconLower.includes('tiktok')) {
                      return <TiktokIcon className={`${iconClass} text-[#000000]`} />
                    }
                    if (iconLower.includes('apple_music') || iconLower.includes('applemusic')) {
                      return <AppleMusicIcon className={iconClass} />
                    }
                    if (iconLower.includes('apple') && !iconLower.includes('music')) {
                      return <AppleIcon className={iconClass} />
                    }
                    if (iconLower.includes('whatsapp')) {
                      return <WhatsappIcon className={iconClass} />
                    }
                    if (iconLower.includes('notion')) {
                      return <NotionIcon className={iconClass} />
                    }
                    if (iconLower.includes('music') || iconLower.includes('soundcloud')) {
                      return <Music className={`${iconClass} text-[#6b7280]`} />
                    }
                    if (iconLower.includes('video')) {
                      return <Video className={`${iconClass} text-[#6b7280]`} />
                    }
                    if (iconLower.includes('instagram')) {
                      return <InstagramIcon className={iconClass} />
                    }
                    if (iconLower.includes('twitter') || iconLower.includes('x')) {
                      return <Twitter className={`${iconClass} text-[#1DA1F2]`} />
                    }
                    if (iconLower.includes('facebook')) {
                      return <Facebook className={`${iconClass} text-[#1877F2]`} />
                    }
                    if (iconLower.includes('linkedin')) {
                      return <LinkedinIcon className={iconClass} />
                    }
                    if (iconLower.includes('github')) {
                      return <Github className={`${iconClass} text-[#181717]`} />
                    }
                    if (iconLower.includes('discord') || iconLower.includes('chat') || iconLower.includes('message')) {
                      return <MessageCircle className={`${iconClass} text-[#5865F2]`} />
                    }
                    if (iconLower.includes('twitch') || iconLower.includes('game')) {
                      return <Gamepad2 className={`${iconClass} text-[#9146FF]`} />
                    }
                    if (iconLower.includes('calendar') || iconLower.includes('calendly')) {
                      return <Calendar className={`${iconClass} text-[#006BFF]`} />
                    }
                    if (iconLower.includes('mail') || iconLower.includes('email')) {
                      return <Mail className={`${iconClass} text-[#6b7280]`} />
                    }
                    if (iconLower.includes('shop') || iconLower.includes('store') || iconLower.includes('cart')) {
                      return <ShoppingBag className={iconClass} />
                    }
                    if (iconLower.includes('pdf') || iconLower.includes('document') || iconLower.includes('file')) {
                      return <FileText className={iconClass} />
                    }
                    if (iconLower.includes('download')) {
                      return <Download className={iconClass} />
                    }
                    if (iconLower.includes('image') || iconLower.includes('photo')) {
                      return <Image className={iconClass} />
                    }
                    if (iconLower.includes('headphone') || iconLower.includes('audio')) {
                      return <Headphones className={iconClass} />
                    }
                    if (iconLower.includes('mic') || iconLower.includes('podcast')) {
                      return <Mic className={iconClass} />
                    }
                    if (iconLower.includes('heart')) {
                      return <Heart className={iconClass} />
                    }
                    if (iconLower.includes('star')) {
                      return <Star className={iconClass} />
                    }
                    if (iconLower.includes('gift')) {
                      return <Gift className={iconClass} />
                    }
                    if (iconLower.includes('ticket')) {
                      return <Ticket className={iconClass} />
                    }
                    if (iconLower.includes('food') || iconLower.includes('menu') || iconLower.includes('restaurant')) {
                      return <UtensilsCrossed className={iconClass} />
                    }
                    if (iconLower.includes('coffee')) {
                      return <Coffee className={iconClass} />
                    }
                    if (iconLower.includes('book')) {
                      return <BookOpen className={iconClass} />
                    }
                    if (iconLower.includes('rocket')) {
                      return <Rocket className={iconClass} />
                    }
                    if (iconLower.includes('globe') || iconLower.includes('website') || iconLower.includes('web')) {
                      return <Globe className={iconClass} />
                    }

                    // Check URL patterns - use brand icons for platforms
                    if (url.includes('youtube.com') || url.includes('youtu.be')) {
                      return <YoutubeIcon className={iconClass} />
                    }
                    if (url.includes('spotify.com')) {
                      return <SpotifyIcon className={`${iconClass} text-[#1DB954]`} />
                    }
                    if (url.includes('music.apple.com') || url.includes('apple.com/music')) {
                      return <AppleMusicIcon className={iconClass} />
                    }
                    if (url.includes('soundcloud.com')) {
                      return <Music className={`${iconClass} text-[#6b7280]`} />
                    }
                    if (url.includes('wa.me') || url.includes('whatsapp.com') || url.includes('api.whatsapp.com')) {
                      return <WhatsappIcon className={iconClass} />
                    }
                    if (url.includes('notion.so') || url.includes('notion.site')) {
                      return <NotionIcon className={iconClass} />
                    }
                    if (url.includes('instagram.com')) {
                      return <InstagramIcon className={iconClass} />
                    }
                    if (url.includes('twitter.com') || url.includes('x.com')) {
                      return <Twitter className={`${iconClass} text-[#1DA1F2]`} />
                    }
                    if (url.includes('facebook.com')) {
                      return <Facebook className={`${iconClass} text-[#1877F2]`} />
                    }
                    if (url.includes('linkedin.com')) {
                      return <LinkedinIcon className={iconClass} />
                    }
                    if (url.includes('github.com')) {
                      return <Github className={`${iconClass} text-[#181717]`} />
                    }
                    if (url.includes('discord.com') || url.includes('discord.gg')) {
                      return <MessageCircle className={`${iconClass} text-[#5865F2]`} />
                    }
                    if (url.includes('twitch.tv')) {
                      return <Gamepad2 className={`${iconClass} text-[#9146FF]`} />
                    }
                    if (url.includes('calendly.com')) {
                      return <Calendar className={`${iconClass} text-[#006BFF]`} />
                    }
                    if (url.includes('tiktok.com')) {
                      return <TiktokIcon className={`${iconClass} text-[#000000]`} />
                    }
                    if (url.includes('amazon.com') || url.includes('amzn.') || url.includes('gumroad.com') || url.includes('shopify')) {
                      return <ShoppingBag className={`${iconClass} text-[#6b7280]`} />
                    }
                    if (url.includes('patreon.com')) {
                      return <Dollar className={`${iconClass} text-[#6b7280]`} />
                    }
                    if (url.includes('apple.com') && !url.includes('music.apple.com')) {
                      return <AppleIcon className={iconClass} />
                    }

                    // Check block type
                    switch (block.blockType) {
                      case 'product': return <ShoppingBag className={iconClass} />
                      case 'pdf_document': return <FileText className={iconClass} />
                      case 'food_menu': return <UtensilsCrossed className={iconClass} />
                      case 'calendly': return <Calendar className={iconClass} />
                      case 'email_capture': return <Mail className={iconClass} />
                      case 'image': return <Image className={iconClass} />
                      case 'social_row': return <Users className={iconClass} />
                      default: return <ExternalLink className={iconClass} />
                    }
                  }

                  return (
                    <div
                      key={block.id}
                      className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-lg hover:bg-[#f3f4f6] transition-all duration-300 ease-out"
                      style={{
                        opacity: index >= 5 ? 1 : 1,
                        transform: index >= 5 ? 'translateY(0)' : 'translateY(0)',
                        animation: index >= 5 && showAllMostClicked ? `fadeSlideIn 0.3s ease-out ${(index - 5) * 0.05}s both` : 'none'
                      }}
                    >
                      {block.thumbnail ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-[#f3f4f6]">
                          <img
                            src={block.thumbnail}
                            alt={block.label}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Hide broken image
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                          {getBlockIconComponent()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#1a1a2e] truncate">{block.label}</p>
                        <p className="text-[11px] text-[#9ca3af] truncate">{displayUrl}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[13px] font-semibold text-[#1a1a2e]">{block.clicks.toLocaleString()} clicks</p>
                      </div>
                    </div>
                  )
                })}
                {/* View All Button - only show if more than 5 items */}
                {mostClickedBlocks.length > 5 && (
                  <button
                    onClick={() => setShowAllMostClicked(!showAllMostClicked)}
                    className="w-full py-2 mt-2 text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e] hover:bg-[#f3f4f6] rounded-lg transition-all duration-200 ease-out cursor-pointer select-none active:scale-[0.98]"
                    style={{
                      opacity: 1,
                      animation: 'fadeIn 0.2s ease-out'
                    }}
                  >
                    {showAllMostClicked ? 'Show Less' : `View All (${mostClickedBlocks.length})`}
                  </button>
                )}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-[#9ca3af] text-[13px]">No click data yet</p>
              </div>
            )}
            {/* Animation keyframes */}
            <style jsx>{`
              @keyframes fadeSlideIn {
                from {
                  opacity: 0;
                  transform: translateY(-8px);
                }
                to {
                  opacity: 1;
                  transform: translateY(0);
                }
              }
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
            `}</style>
          </CardContent>
        </Card>

        {/* Visitors by Country */}
        <Card className={`border-[#e5e7eb] bg-white transition-opacity duration-300 ${showSampleData && !hasRealData ? "opacity-60" : ""}`}>
          <CardHeader className="pb-0 pt-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">Visitors by Country</CardTitle>
              {showSampleData && !hasRealData && <span className="text-[10px] font-medium text-indigo-400/80 bg-indigo-50 px-2 py-0.5 rounded-full">Sample</span>}
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {displayCountryData.length > 0 ? (
              <>
                {/* Country Table */}
                <div className="overflow-x-auto" style={{ touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#e5e7eb]">
                        <th className="text-left text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider pb-2">Country</th>
                        <th className="text-right text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider pb-2">Views</th>
                        <th className="text-right text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider pb-2">
                          {analyticsMode === "onepage" ? "Clicks" : "Orders"}
                        </th>
                        <th className="text-right text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider pb-2">
                          {analyticsMode === "onepage" ? "Subscribers" : "Revenue"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayCountryData.map((country) => (
                        <tr key={country.code} className="border-b border-[#f3f4f6] last:border-0">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              {country.code === "OTHER" ? (
                                <Globe className="h-4 w-4 text-[#9ca3af]" />
                              ) : (
                                <span className="text-[16px]">{getCountryFlag(country.code)}</span>
                            )}
                            <span className="text-[13px] font-medium text-[#1a1a2e]">{country.name}</span>
                          </div>
                        </td>
                        <td className="text-right py-2.5">
                          <span className="text-[13px] text-[#6b7280]">{country.views.toLocaleString()}</span>
                        </td>
                        <td className="text-right py-2.5">
                          <span className="text-[13px] text-[#6b7280]">{country.orders.toLocaleString()}</span>
                        </td>
                        <td className="text-right py-2.5">
                          <span className="text-[13px] text-[#6b7280]">
                            {analyticsMode === "onepage" ? country.revenue.toLocaleString() : formatPrice(country.revenue)}
                          </span>
                        </td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="py-6 text-center">
                <Globe className="h-8 w-8 mx-auto mb-2 text-[#e5e7eb]" />
                <p className="text-[#9ca3af] text-[13px]">No visitor location data yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        </>
        )}
      </div>

      {/* Mobile Bottom Sheets */}
      <AnalyticsTimeframeSheet
        isOpen={isTimeframeSheetOpen}
        onClose={() => setIsTimeframeSheetOpen(false)}
        options={timeframeOptions}
        selectedValue={timeframe}
        onSelect={(value) => setTimeframe(value)}
      />
      <AnalyticsProductsSheet
        isOpen={isProductsSheetOpen}
        onClose={() => setIsProductsSheetOpen(false)}
        products={products}
        selectedProduct={selectedProduct}
        onSelect={(value) => setSelectedProduct(value)}
      />
    </div>
  )
}

function getCountryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌍"
  const codePoints = code.toUpperCase().split("").map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}
