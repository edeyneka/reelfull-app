import { useRouter } from 'expo-router';
import { ArrowLeft, User, Palette, Edit2, Check, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { StylePreference } from '@/types';

const STYLE_OPTIONS: StylePreference[] = ['Playful', 'Professional', 'Dreamy'];

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, saveUser } = useApp();
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingStyle, setIsEditingStyle] = useState(false);
  const [editedName, setEditedName] = useState(user?.name || '');
  const [editedStyle, setEditedStyle] = useState<StylePreference | null>(user?.style || null);

  const handleSaveName = async () => {
    if (editedName.trim().length === 0) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }
    
    if (user && editedStyle) {
      await saveUser({ name: editedName.trim(), style: editedStyle });
      setIsEditingName(false);
    }
  };

  const handleCancelName = () => {
    setEditedName(user?.name || '');
    setIsEditingName(false);
  };

  const handleSaveStyle = async () => {
    if (!editedStyle) {
      Alert.alert('Error', 'Please select a style');
      return;
    }
    
    if (user && editedName) {
      await saveUser({ name: editedName.trim(), style: editedStyle });
      setIsEditingStyle(false);
    }
  };

  const handleCancelStyle = () => {
    setEditedStyle(user?.style || null);
    setIsEditingStyle(false);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color={Colors.white} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Information</Text>
          
          {/* Name Card */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.iconContainer}>
                <User size={20} color={Colors.orange} strokeWidth={2} />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>Name</Text>
                {isEditingName ? (
                  <TextInput
                    style={styles.input}
                    value={editedName}
                    onChangeText={setEditedName}
                    placeholder="Enter your name"
                    placeholderTextColor={Colors.grayLight}
                    autoCapitalize="words"
                    autoFocus
                  />
                ) : (
                  <Text style={styles.cardValue}>{user?.name || 'Not set'}</Text>
                )}
              </View>
              <View style={styles.actionButtons}>
                {isEditingName ? (
                  <>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={handleSaveName}
                      activeOpacity={0.7}
                    >
                      <Check size={20} color={Colors.orange} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={handleCancelName}
                      activeOpacity={0.7}
                    >
                      <X size={20} color={Colors.grayLight} strokeWidth={2} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => setIsEditingName(true)}
                    activeOpacity={0.7}
                  >
                    <Edit2 size={18} color={Colors.orange} strokeWidth={2} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Style Card */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.iconContainer}>
                <Palette size={20} color={Colors.orange} strokeWidth={2} />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>Style Preference</Text>
                {isEditingStyle ? (
                  <View style={styles.styleOptions}>
                    {STYLE_OPTIONS.map((style) => (
                      <TouchableOpacity
                        key={style}
                        style={[
                          styles.styleOption,
                          editedStyle === style && styles.styleOptionSelected,
                        ]}
                        onPress={() => setEditedStyle(style)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.styleOptionText,
                            editedStyle === style && styles.styleOptionTextSelected,
                          ]}
                        >
                          {style}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.cardValue}>{user?.style || 'Not set'}</Text>
                )}
              </View>
              <View style={styles.actionButtons}>
                {isEditingStyle ? (
                  <>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={handleSaveStyle}
                      activeOpacity={0.7}
                    >
                      <Check size={20} color={Colors.orange} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={handleCancelStyle}
                      activeOpacity={0.7}
                    >
                      <X size={20} color={Colors.grayLight} strokeWidth={2} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => setIsEditingStyle(true)}
                    activeOpacity={0.7}
                  >
                    <Edit2 size={18} color={Colors.orange} strokeWidth={2} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: Colors.black,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  placeholder: {
    width: 40,
  },
  content: {
    padding: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.grayLight,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.grayDark,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.gray,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 14,
    color: Colors.grayLight,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  input: {
    backgroundColor: Colors.gray,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: Colors.white,
    borderWidth: 2,
    borderColor: Colors.orange,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  styleOptions: {
    gap: 8,
    marginTop: 8,
  },
  styleOption: {
    backgroundColor: Colors.gray,
    borderRadius: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  styleOptionSelected: {
    borderColor: Colors.orange,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  styleOptionText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.white,
    textAlign: 'center',
  },
  styleOptionTextSelected: {
    color: Colors.orange,
  },
});

