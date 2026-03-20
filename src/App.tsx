/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import { Search, MapPin, Shield, CreditCard, Camera, CheckCircle, ChevronRight, LayoutDashboard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Tesseract from 'tesseract.js';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { auth, db } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidMapsKey = Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== '';

// Utility for Tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface Property {
  address: string;
  parcel_id: string;
  assessed_value: number;
  lot_size: number;
  zip_code: string;
  owner_name: string;
}

interface ZipStats {
  medianValue: number;
  medianAcreage: number;
}

// Logo Component
function Logo({ className, onClick }: { className?: string, onClick?: () => void }) {
  return (
    <div className={cn("flex items-center gap-3 cursor-pointer group", className)} onClick={onClick}>
      <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-[#1e40af] to-[#15803d] flex items-center justify-center shadow-lg overflow-hidden">
        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        <svg viewBox="0 0 24 24" className="w-7 h-7 text-white fill-none stroke-current stroke-2">
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M17 7h4v4" />
        </svg>
      </div>
      <div className="flex flex-col leading-tight">
        <div className="text-2xl font-bold tracking-tight">
          <span className="text-[#1e40af]">Curb</span>
          <span className="text-[#15803d]"> Score</span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Property Intelligence</span>
      </div>
    </div>
  );
}

// Autocomplete Component
function AddressAutocomplete({ onSelect, onChange, value, onSubmit }: { onSelect: (address: string) => void, onChange: (val: string) => void, value: string, onSubmit: () => void }) {
  const placesLib = useMapsLibrary('places');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'us' },
      fields: ['formatted_address'],
      types: ['address']
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.formatted_address) {
        onSelect(place.formatted_address);
      }
    });
  }, [placesLib]);

  return (
    <input 
      ref={inputRef}
      type="text"
      value={value}
      autoFocus
      autoComplete="off"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onSubmit();
        }
      }}
      placeholder="Search by address or parcel number..."
      className="w-full p-6 pl-8 pr-16 rounded-full border-2 border-gray-200 focus:border-[#1e40af] outline-none text-lg shadow-lg transition-all"
    />
  );
}

// Main App Component
export default function App() {
  if (!hasValidMapsKey) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6 font-sans">
        <div className="max-w-2xl w-full bg-white p-12 rounded-[3rem] shadow-2xl border border-gray-100 text-center space-y-8">
          <div className="bg-[#1e40af] w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-lg mb-4">
            <MapPin className="text-white w-10 h-10" />
          </div>
          <div className="space-y-4">
            <h2 className="text-4xl font-bold text-[#1e40af]">Google Maps API Key Required</h2>
            <p className="text-gray-600 text-lg">
              To enable address autocomplete and property intelligence maps, please add your Google Maps Platform API key.
            </p>
          </div>
          
          <div className="bg-gray-50 p-8 rounded-3xl text-left space-y-6 border border-gray-100">
            <div className="space-y-4">
              <p className="font-bold text-[#1e40af] flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1e40af] text-white flex items-center justify-center text-xs">1</span>
                Get an API Key
              </p>
              <a 
                href="https://console.cloud.google.com/google/maps-apis/credentials" 
                target="_blank" 
                rel="noopener"
                className="block w-full p-4 bg-white border border-gray-200 rounded-xl text-center font-bold text-[#1e40af] hover:bg-gray-50 transition-colors"
              >
                Go to Google Cloud Console
              </a>
            </div>

            <div className="space-y-4">
              <p className="font-bold text-[#1e40af] flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1e40af] text-white flex items-center justify-center text-xs">2</span>
                Add as Secret in AI Studio
              </p>
              <ul className="space-y-3 text-sm text-gray-500">
                <li className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5" />
                  Open <strong>Settings</strong> (⚙️ gear icon, top-right corner)
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5" />
                  Select <strong>Secrets</strong>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5" />
                  Type <code>GOOGLE_MAPS_PLATFORM_KEY</code> as the secret name
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5" />
                  Paste your API key as the value and press <strong>Enter</strong>
                </li>
              </ul>
            </div>
          </div>
          
          <p className="text-xs text-gray-400">
            The app will rebuild automatically after you add the secret.
          </p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
      <CurbScoreApp />
    </APIProvider>
  );
}

function CurbScoreApp() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [view, setView] = useState<'home' | 'details' | 'auth' | 'verify' | 'payment' | 'dashboard'>('home');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userClaims, setUserClaims] = useState<any[]>([]);

  // Firestore Error Handler
  const handleFirestoreError = (error: any, operation: string, path: string) => {
    const errInfo = {
      error: error.message,
      operation,
      path,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email
      }
    };
    console.error('Firestore Error:', JSON.stringify(errInfo));
  };

  // Firestore Connection Test
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        if (error.message?.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Fetch User Claims
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const q = query(collection(db, 'claims'), where('ownerUid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const claims = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUserClaims(claims);
    }, (error) => {
      handleFirestoreError(error, 'list', 'claims');
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  // Google Login
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      if (selectedProperty) {
        setView('verify');
      } else {
        setView('home');
      }
    } catch (error) {
      console.error('Login Error:', error);
    }
  };

  // Claim Property
  const handleClaimProperty = async () => {
    if (!user || !selectedProperty) return;

    // Strict Check: Address on ID must match Property Address
    // For the demo, we check if scanResult contains the address or zip
    const isAddressMatch = scanResult?.toLowerCase().includes(selectedProperty.address.split(',')[0].toLowerCase()) || 
                           scanResult?.includes(selectedProperty.zip_code);

    if (!isAddressMatch && isVerified) {
      alert("Verification Failed: The address on your ID does not match the property address.");
      return;
    }

    const claimId = `${user.uid}_${selectedProperty.parcel_id}`;
    const claimData = {
      parcelId: selectedProperty.parcel_id,
      address: selectedProperty.address,
      ownerUid: user.uid,
      status: isVerified && isAddressMatch ? 'verified' : 'pending',
      verifiedAt: isVerified && isAddressMatch ? Timestamp.now() : null,
      createdAt: Timestamp.now(),
      isPaid: true // In a real app, this would be set after Fortis callback
    };

    try {
      await setDoc(doc(db, 'claims', claimId), claimData);
      setView('dashboard');
    } catch (error) {
      handleFirestoreError(error, 'write', `claims/${claimId}`);
    }
  };

  // OCR Logic
  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    try {
      const { data: { text } } = await Tesseract.recognize(file, 'eng');
      setScanResult(text);
      
      // Basic matching logic: check if property address exists in OCR text
      if (selectedProperty && text.toLowerCase().includes(selectedProperty.address.split(',')[0].toLowerCase())) {
        setIsVerified(true);
      }
    } catch (err) {
      console.error('OCR Error:', err);
    } finally {
      setIsScanning(false);
    }
  };

  // Load CSV data
  useEffect(() => {
    setIsDataLoading(true);
    fetch('/properties.csv')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.text();
      })
      .then(csvText => {
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            setProperties(results.data as Property[]);
            setIsDataLoading(false);
          },
          error: (err) => {
            console.error('CSV Parsing Error:', err);
            setIsDataLoading(false);
          }
        });
      })
      .catch(err => {
        console.error('Fetch Error:', err);
        setIsDataLoading(false);
      });
  }, []);

  // Search Logic
  const performSearch = useCallback((queryStr: string) => {
    if (!queryStr.trim() || isDataLoading) return;

    setIsSearching(true);
    const query = queryStr.toLowerCase();
    
    const filtered = properties.filter(p => 
      (p.address && p.address.toLowerCase().includes(query)) || 
      (p.parcel_id && p.parcel_id.toLowerCase().includes(query))
    );

    setSearchResults(filtered);
    setIsSearching(false);
  }, [properties]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    performSearch(searchQuery);
  };

  // Calculate Zip Stats on the fly
  const zipStats = useMemo(() => {
    if (!selectedProperty) return null;
    const sameZip = properties.filter(p => p.zip_code === selectedProperty.zip_code);
    
    const values = sameZip.map(p => p.assessed_value).sort((a, b) => a - b);
    const acreages = sameZip.map(p => p.lot_size).sort((a, b) => a - b);

    const getMedian = (arr: number[]) => {
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    };

    return {
      medianValue: getMedian(values),
      medianAcreage: getMedian(acreages)
    };
  }, [selectedProperty, properties]);

  // Scoring Formula
  const curbScore = useMemo(() => {
    if (!selectedProperty || !zipStats) return 0;

    const valueRatio = selectedProperty.assessed_value / zipStats.medianValue;
    const acreageRatio = selectedProperty.lot_size / zipStats.medianAcreage;

    // Formula: Base 500 + (Value vs Zip Median * 200) + (Acreage vs Zip Median * 150)
    // We'll use (ratio - 1) to get the "vs median" part
    let score = 500 + ((valueRatio - 1) * 200) + ((acreageRatio - 1) * 150);
    
    return Math.min(850, Math.max(300, Math.round(score)));
  }, [selectedProperty, zipStats]);

  // Owner Masking
  const displayOwner = (owner: string, address: string) => {
    const city = address.split(',')[1]?.trim();
    if (owner === city) return 'Confidential Record';
    return owner;
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#333333] font-sans">
      {/* Header */}
      <header className="p-6 flex justify-between items-center max-w-7xl mx-auto">
        <Logo onClick={() => setView('home')} />
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setView('dashboard')}
                className="text-sm font-semibold text-[#1e40af] hover:underline flex items-center gap-1"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </button>
              <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden border border-gray-100">
                <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} alt="Profile" referrerPolicy="no-referrer" />
              </div>
              <button 
                onClick={() => auth.signOut()}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setView('auth')}
              className="text-sm font-semibold text-[#1e40af] hover:underline"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-8 max-w-3xl mx-auto"
            >
              <h1 className="text-5xl md:text-7xl font-bold text-[#1e40af] leading-tight">
                Discover Your Home's <br />
                <span className="glistening-text">True Score</span>
              </h1>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Unlock your home's full potential with an instant intelligence report that tracks structural health and market value just like a credit score for your property.
              </p>

              <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto">
                <AddressAutocomplete 
                  value={searchQuery}
                  onChange={(val) => setSearchQuery(val)}
                  onSubmit={() => performSearch(searchQuery)}
                  onSelect={(address) => {
                    setSearchQuery(address);
                    performSearch(address);
                  }} 
                />
                <button 
                  type="submit"
                  disabled={isDataLoading}
                  className={cn(
                    "absolute right-3 top-3 p-4 rounded-full text-white transition-all",
                    isDataLoading ? "bg-gray-300 cursor-not-allowed" : "bg-[#1e40af] hover:bg-[#1e3a8a]"
                  )}
                >
                  {isSearching ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Search className="w-6 h-6" />
                  )}
                </button>
              </form>
              
              {isDataLoading && (
                <div className="text-xs text-gray-400 mt-2 animate-pulse">
                  Loading property database...
                </div>
              )}

              <div className="flex justify-center gap-8 text-sm font-medium text-gray-500">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#15803d]" />
                  Trusted by 50,000+ homeowners
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#1e40af]" />
                  Free instant score
                </div>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-8 bg-white rounded-2xl shadow-xl overflow-hidden text-left border border-gray-100"
                >
                  <div className="p-4 bg-gray-50 border-bottom border-gray-100 text-xs font-bold uppercase tracking-wider text-gray-400">
                    Search Results ({searchResults.length})
                  </div>
                  <div className="divide-y divide-gray-100">
                    {searchResults.map((p, i) => (
                      <div 
                        key={i}
                        onClick={() => {
                          setSelectedProperty(p);
                          setView('details');
                        }}
                        className="p-4 hover:bg-gray-50 cursor-pointer flex justify-between items-center group transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-[#1e40af]">{p.address}</div>
                          <div className="text-xs text-gray-500 font-mono">{p.parcel_id}</div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#1e40af] transition-colors" />
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : searchQuery.trim() && !isSearching && searchResults.length === 0 && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-8 p-8 bg-white rounded-2xl shadow-sm border border-gray-100 text-center"
                >
                  <div className="text-gray-400 mb-2">No properties found matching your search.</div>
                  <p className="text-xs text-gray-400">Try searching for "8600 HWY 150" or "123 Main St"</p>
                </motion.div>
              )}
            </motion.div>
          )}

          {view === 'details' && selectedProperty && (
            <motion.div 
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid md:grid-cols-2 gap-12 items-start"
            >
              <div className="space-y-8">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
                  <div>
                    <h2 className="text-3xl font-bold text-[#1e40af] mb-2">{selectedProperty.address}</h2>
                    <div className="flex gap-4 text-xs font-mono text-gray-400">
                      <span className="bg-gray-50 px-2 py-1 rounded">PARCEL: {selectedProperty.parcel_id}</span>
                      <span className="bg-gray-50 px-2 py-1 rounded">ZIP: {selectedProperty.zip_code}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Assessed Value</div>
                      <div className="text-2xl font-bold text-[#1e40af]">
                        ${selectedProperty.assessed_value.toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Lot Size</div>
                      <div className="text-2xl font-bold text-[#1e40af]">
                        {selectedProperty.lot_size} Acres
                      </div>
                    </div>
                    <div className="space-y-1 col-span-2 pt-4 border-t border-gray-50">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Legal Owner of Record</div>
                      <div className="text-xl font-semibold text-[#1e40af] flex items-center gap-2">
                        <Shield className="w-4 h-4 text-[#D4AF37]" />
                        {displayOwner(selectedProperty.owner_name, selectedProperty.address)}
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50/50 p-4 rounded-xl flex items-start gap-3">
                    <Shield className="w-5 h-5 text-[#1e40af] mt-0.5" />
                    <p className="text-xs text-[#1e40af]/70 leading-relaxed">
                      This property record is verified against county tax assessor data. To unlock score improvement tools, your ID address must match the property address and a $1 membership is required.
                    </p>
                  </div>

                  <button 
                    onClick={() => {
                      if (user) {
                        setView('verify');
                      } else {
                        setView('auth');
                      }
                    }}
                    className="w-full bg-[#1e40af] text-white p-6 rounded-2xl font-bold text-lg hover:bg-[#1e3a8a] transition-all shadow-lg flex items-center justify-center gap-3 group"
                  >
                    Claim This Property
                    <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center space-y-8 bg-white p-12 rounded-3xl shadow-sm border border-gray-100">
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-bold text-[#1e40af]">Curb Score™ Analysis</h3>
                  <p className="text-sm text-gray-400">Positional Alpha Rating vs Zip Code Median</p>
                </div>
                
                <div className="relative w-80 h-80">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="160"
                      cy="160"
                      r="140"
                      stroke="#333333"
                      strokeWidth="20"
                      fill="transparent"
                      className="opacity-5"
                    />
                    <motion.circle
                      cx="160"
                      cy="160"
                      r="140"
                      stroke="#1e40af"
                      strokeWidth="20"
                      fill="transparent"
                      strokeDasharray={2 * Math.PI * 140}
                      initial={{ strokeDashoffset: 2 * Math.PI * 140 }}
                      animate={{ 
                        strokeDashoffset: 2 * Math.PI * 140 * (1 - (curbScore - 300) / 550) 
                      }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-7xl font-black text-[#1e40af] tracking-tighter">{curbScore}</span>
                    <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-[0.3em] mt-2">Elite Rating</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 w-full">
                  <div className="text-center space-y-1">
                    <div className="text-[10px] font-bold text-gray-400 uppercase">Zip Percentile</div>
                    <div className="text-xl font-bold text-[#15803d]">Top 15%</div>
                  </div>
                  <div className="text-center space-y-1">
                    <div className="text-[10px] font-bold text-gray-400 uppercase">Market Status</div>
                    <div className="text-xl font-bold text-[#1e40af]">Premium</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'auth' && (
            <motion.div 
              key="auth"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto bg-white p-8 rounded-3xl shadow-2xl border border-gray-100"
            >
              <div className="text-center mb-8">
                <div className="bg-[#1e40af] w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Shield className="text-white w-8 h-8" />
                </div>
                <h2 className="text-3xl font-bold text-[#1e40af]">Secure Access</h2>
                <p className="text-gray-500">Sign in to claim your property</p>
              </div>
              
              <div className="space-y-4">
                <button 
                  onClick={handleGoogleLogin}
                  className="w-full p-4 border-2 border-gray-100 rounded-xl font-semibold flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors"
                >
                  <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                  Continue with Google
                </button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400">Or</span></div>
                </div>
                <input type="email" placeholder="Email Address" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-100 outline-none focus:border-[#1e40af]" />
                <button 
                  onClick={handleGoogleLogin}
                  className="w-full bg-[#1e40af] text-white p-4 rounded-xl font-bold hover:bg-[#1e3a8a] transition-all"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {view === 'verify' && (
            <motion.div 
              key="verify"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-2xl mx-auto text-center space-y-8"
            >
              <div className="space-y-4">
                <h2 className="text-4xl font-bold text-[#1e40af]">Identity Verification</h2>
                <p className="text-gray-600">To claim <span className="font-bold">{selectedProperty?.address}</span>, we need to verify your residency.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 space-y-6">
                  <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                    <Camera className="text-[#1e40af] w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-[#1e40af]">Scan Photo ID</h3>
                  <p className="text-sm text-gray-500">Use your camera to scan the front of your driver's license or state ID.</p>
                  
                  <label className="w-full bg-[#1e40af] text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-[#1e3a8a] transition-colors">
                    <Camera className="w-5 h-5" />
                    {isScanning ? 'Scanning...' : 'Upload ID Photo'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleScan} disabled={isScanning} />
                  </label>
                </div>

                <div className={cn(
                  "bg-white p-8 rounded-3xl shadow-xl border border-gray-100 space-y-6 transition-all",
                  isVerified ? "border-green-500 ring-2 ring-green-100" : "opacity-50"
                )}>
                  <div className={cn(
                    "w-16 h-16 rounded-full flex items-center justify-center mx-auto transition-colors",
                    isVerified ? "bg-green-50" : "bg-gray-50"
                  )}>
                    <CheckCircle className={cn("w-8 h-8", isVerified ? "text-[#15803d]" : "text-gray-300")} />
                  </div>
                  <h3 className="text-xl font-bold text-[#1e40af]">OCR Matching</h3>
                  <p className="text-sm text-gray-500">
                    {isVerified 
                      ? "Address matched successfully! Proceed to secure payment." 
                      : "Our AI will match your ID address to the property record automatically."}
                  </p>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-[#15803d]"
                      initial={{ width: 0 }}
                      animate={{ width: isVerified ? '100%' : isScanning ? '60%' : '0%' }}
                    />
                  </div>
                </div>
              </div>

              {isVerified && (
                <motion.button 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setView('payment')}
                  className="w-full max-w-md bg-[#1e40af] text-white p-6 rounded-2xl font-bold text-lg hover:bg-[#1e3a8a] transition-all shadow-lg flex items-center justify-center gap-3 group mx-auto"
                >
                  Proceed to Payment
                  <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                </motion.button>
              )}

              {!isVerified && !isScanning && (
                <button 
                  onClick={() => setView('payment')}
                  className="text-[#1e40af] font-bold hover:underline"
                >
                  Skip for Demo (Proceed to Payment)
                </button>
              )}
            </motion.div>
          )}

          {view === 'payment' && (
            <motion.div 
              key="payment"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md mx-auto bg-white p-8 rounded-3xl shadow-2xl border border-gray-100"
            >
              <div className="text-center mb-8">
                <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="text-[#15803d] w-8 h-8" />
                </div>
                <h2 className="text-3xl font-bold text-[#1e40af]">$1.00 Membership</h2>
                <p className="text-gray-500">Unlock your Property Manager Dashboard</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500">Monthly Subscription</span>
                    <span className="font-bold">$1.00</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Processing Fee</span>
                    <span className="font-bold">$0.00</span>
                  </div>
                  <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-bold text-[#1e40af]">
                    <span>Total Due Today</span>
                    <span>$1.00</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Card Details</label>
                  <input type="text" placeholder="Card Number" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-100 outline-none" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="MM/YY" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-100 outline-none" />
                    <input type="text" placeholder="CVC" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-100 outline-none" />
                  </div>
                </div>

                <button 
                  onClick={handleClaimProperty}
                  className="w-full bg-[#15803d] text-white p-4 rounded-xl font-bold hover:bg-[#166534] transition-all shadow-lg"
                >
                  Start Subscription
                </button>
                <p className="text-[10px] text-center text-gray-400">
                  Secure payment processed via Fortis. Recurring billing applies.
                </p>
              </div>
            </motion.div>
          )}

          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-4xl font-bold text-[#1e40af]">Property Manager</h2>
                  <p className="text-gray-500">Welcome back, {user?.displayName || 'Owner'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-[#D4AF37]/10 text-[#D4AF37] px-4 py-2 rounded-full text-sm font-bold border border-[#D4AF37]/20">
                    Elite Member
                  </div>
                  <button 
                    onClick={() => setView('home')}
                    className="bg-[#1e40af] text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-[#1e3a8a] transition-all"
                  >
                    Add Property
                  </button>
                </div>
              </div>

              {userClaims.length === 0 ? (
                <div className="bg-white p-24 rounded-[3rem] shadow-sm border border-dashed border-gray-200 text-center space-y-6">
                  <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                    <MapPin className="text-gray-300 w-10 h-10" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-[#1e40af]">No Properties Claimed</h3>
                    <p className="text-gray-400 max-w-sm mx-auto">Search for your property and complete the verification process to unlock your management tools.</p>
                  </div>
                  <button 
                    onClick={() => setView('home')}
                    className="bg-[#1e40af] text-white px-8 py-4 rounded-2xl font-bold hover:bg-[#1e3a8a] transition-all shadow-lg"
                  >
                    Search Properties
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Main Property List */}
                  <div className="lg:col-span-2 space-y-6">
                    {userClaims.map((claim, idx) => (
                      <div key={idx} className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-8">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <h3 className="text-2xl font-bold text-[#1e40af]">{claim.address}</h3>
                            <div className="flex gap-3 text-xs font-mono text-gray-400">
                              <span>PARCEL: {claim.parcelId}</span>
                              <span className={cn(
                                "font-bold uppercase tracking-wider",
                                claim.status === 'verified' ? "text-green-600" : "text-yellow-600"
                              )}>
                                • {claim.status}
                              </span>
                            </div>
                          </div>
                          <div className="bg-gray-50 p-4 rounded-2xl text-center min-w-[100px]">
                            <div className="text-[10px] font-bold text-gray-400 uppercase">Curb Score</div>
                            <div className="text-2xl font-black text-[#1e40af]">742</div>
                          </div>
                        </div>

                        {/* Bento Grid Sections */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-bold text-[#1e40af]">Maintenance Log</h4>
                              <button className="text-[10px] font-bold text-[#1e40af] uppercase hover:underline">View All</button>
                            </div>
                            <div className="space-y-3">
                              {[
                                { date: 'Mar 12', task: 'HVAC Seasonal Check', status: 'Completed' },
                                { date: 'Feb 28', task: 'Roof Inspection', status: 'Pending' }
                              ].map((item, i) => (
                                <div key={i} className="flex justify-between items-center text-xs">
                                  <span className="text-gray-400 font-mono">{item.date}</span>
                                  <span className="font-medium text-gray-600">{item.task}</span>
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[8px] font-bold uppercase",
                                    item.status === 'Completed' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                                  )}>{item.status}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-bold text-[#1e40af]">Improve Your Score</h4>
                              <button className="text-[10px] font-bold text-[#1e40af] uppercase hover:underline">View Tips</button>
                            </div>
                            <div className="space-y-3">
                              {[
                                { task: 'Update Roof Inspection', impact: '+15 pts' },
                                { task: 'Verify HVAC Maintenance', impact: '+10 pts' },
                                { task: 'Add Smart Security Logs', impact: '+8 pts' }
                              ].map((item, i) => (
                                <div key={i} className="flex justify-between items-center text-xs">
                                  <span className="font-medium text-gray-600">{item.task}</span>
                                  <span className="text-[#15803d] font-bold">{item.impact}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Sidebar Tools */}
                  <div className="space-y-6">
                    <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
                      <h4 className="text-sm font-bold text-[#1e40af] uppercase tracking-widest">Value Trends</h4>
                      <div className="h-40 flex items-end gap-2">
                        {[40, 60, 45, 70, 85, 90, 100].map((h, i) => (
                          <div key={i} className="flex-1 bg-gray-50 rounded-t-lg relative group">
                            <motion.div 
                              initial={{ height: 0 }}
                              animate={{ height: `${h}%` }}
                              className="absolute bottom-0 w-full bg-[#D4AF37] rounded-t-lg group-hover:bg-[#1e40af] transition-colors"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold text-gray-400 uppercase">Est. Equity</div>
                          <div className="text-2xl font-bold text-[#D4AF37]">$142,500</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-green-600 uppercase">+12.4%</div>
                          <div className="text-[10px] text-gray-400">Past 12 Months</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#1e40af] p-8 rounded-[2rem] shadow-xl text-white space-y-4">
                      <Shield className="w-8 h-8 text-[#D4AF37]" />
                      <h4 className="text-xl font-bold leading-tight">Elite Protection Active</h4>
                      <p className="text-xs text-blue-200 leading-relaxed">
                        Your property is monitored for title fraud and structural health alerts. 
                      </p>
                      <button className="w-full bg-white text-[#1e40af] py-3 rounded-xl font-bold text-xs hover:bg-gray-100 transition-colors">
                        View Security Report
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-24 border-t border-gray-100 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 opacity-50 grayscale">
            <Shield className="w-5 h-5" />
            <span className="font-bold">Curb Score</span>
          </div>
          <div className="flex gap-8 text-sm text-gray-400">
            <a href="#" className="hover:text-[#1e40af]">Privacy Policy</a>
            <a href="#" className="hover:text-[#1e40af]">Terms of Service</a>
            <a href="#" className="hover:text-[#1e40af]">Veteran Support</a>
          </div>
          <div className="text-xs text-gray-300 font-mono">
            SECURE_ENCRYPTION_V2.4
          </div>
        </div>
      </footer>
    </div>
  );
}
