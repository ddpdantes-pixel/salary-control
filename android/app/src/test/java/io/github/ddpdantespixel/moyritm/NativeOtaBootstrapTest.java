package io.github.ddpdantespixel.moyritm;

import android.content.SharedPreferences;
import java.util.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativeOtaBootstrapTest {
    @Test public void selectsBuiltinAndRetainsEveryBundleRecordAndSecurityField() {
        Prefs own=new Prefs(), updater=new Prefs(), control=new Prefs();
        own.values.put("nativeCode",3L);
        updater.values.put("serverBasePath","/data/app/files/versions/old3");
        updater.values.put("pastVersion","older3"); updater.values.put("nextVersion","queued3");
        updater.values.put("previewFallbackVersion","preview3");
        updater.values.put("old3_info","success-record");updater.values.put("failed3_info","error-record");
        control.values.put("sequence",900L);control.values.put("revokedVersions","[\"revoked\"]");
        control.values.put("pending","queued3");control.values.put("pendingNativeCode",3L);
        assertTrue(NativeOtaBootstrap.prepare(own,updater,control,4));
        assertEquals("",updater.getString("serverBasePath",null));assertEquals("builtin",updater.getString("pastVersion",null));
        assertFalse(updater.contains("nextVersion"));assertFalse(updater.contains("previewFallbackVersion"));
        assertEquals("success-record",updater.getString("old3_info",null));assertEquals("error-record",updater.getString("failed3_info",null));
        assertEquals(900,control.getLong("sequence",0));assertEquals("[\"revoked\"]",control.getString("revokedVersions",null));
        assertFalse(control.contains("pending"));assertEquals(4,own.getLong("nativeCode",0));
    }
    @Test public void aNormalColdStartOrActivityRecreationKeepsCompatibleActiveAndQueuedBundles() {
        Prefs own=new Prefs(), updater=new Prefs(), control=new Prefs();own.values.put("nativeCode",4L);
        updater.values.put("serverBasePath","new4");updater.values.put("nextVersion","queued4");control.values.put("pending","queued4");
        Map<String,Object> before=new HashMap<>(updater.values);
        assertFalse(NativeOtaBootstrap.prepare(own,updater,control,4));
        assertEquals(before,updater.values);assertEquals("queued4",control.getString("pending",null));
    }
    @Test public void missingMarkerSafelyInitializesOnceWithoutClearingUnrelatedFields() {
        Prefs own=new Prefs(), updater=new Prefs(), control=new Prefs();updater.values.put("known_info","record");
        assertTrue(NativeOtaBootstrap.prepare(own,updater,control,4));assertEquals("record",updater.getString("known_info",null));
        assertFalse(NativeOtaBootstrap.prepare(own,updater,control,4));
    }
    @Test public void failedPersistenceDoesNotCommitCompletionAndIsRetried() {
        Prefs own=new Prefs(), updater=new Prefs(), control=new Prefs();own.values.put("nativeCode",3L);control.fail=true;
        try {NativeOtaBootstrap.prepare(own,updater,control,4);fail("Must fail closed");}
        catch(IllegalStateException expected){assertEquals("NATIVE_OLD_QUEUE_CANCEL_FAILED",expected.getMessage());}
        assertEquals(3,own.getLong("nativeCode",0));control.fail=false;
        assertTrue(NativeOtaBootstrap.prepare(own,updater,control,4));
    }
    static class Prefs implements SharedPreferences {
        final Map<String,Object> values=new HashMap<>(); boolean fail;
        public Map<String,?> getAll(){return new HashMap<>(values);}
        public String getString(String key,String fallback){return (String)values.getOrDefault(key,fallback);}
        @SuppressWarnings("unchecked") public Set<String> getStringSet(String key,Set<String> fallback){return (Set<String>)values.getOrDefault(key,fallback);}
        public int getInt(String key,int fallback){return ((Number)values.getOrDefault(key,fallback)).intValue();}
        public long getLong(String key,long fallback){return ((Number)values.getOrDefault(key,fallback)).longValue();}
        public float getFloat(String key,float fallback){return ((Number)values.getOrDefault(key,fallback)).floatValue();}
        public boolean getBoolean(String key,boolean fallback){return (Boolean)values.getOrDefault(key,fallback);}
        public boolean contains(String key){return values.containsKey(key);}
        public void registerOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener listener){}
        public void unregisterOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener listener){}
        public Editor edit(){return new Editor(){
            final Map<String,Object> writes=new HashMap<>();final Set<String> removes=new HashSet<>();
            public Editor putString(String k,String v){writes.put(k,v);return this;}
            public Editor putStringSet(String k,Set<String> v){writes.put(k,v);return this;}
            public Editor putInt(String k,int v){writes.put(k,v);return this;}
            public Editor putLong(String k,long v){writes.put(k,v);return this;}
            public Editor putFloat(String k,float v){writes.put(k,v);return this;}
            public Editor putBoolean(String k,boolean v){writes.put(k,v);return this;}
            public Editor remove(String k){removes.add(k);return this;}
            public Editor clear(){throw new AssertionError("No storage clear is permitted");}
            public boolean commit(){if(fail)return false;for(String k:removes)values.remove(k);values.putAll(writes);return true;}
            public void apply(){commit();}
        };}
    }
}
