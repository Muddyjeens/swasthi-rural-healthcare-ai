import { StyleSheet, Text, View } from 'react-native';

export function PrivacyNotice() {
  return (
    <View style={styles.notice}>
      <Text style={styles.text}>
        Privacy: conversations and photos are used only for this assessment and are not permanently saved in this demo.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: 1,
    borderColor: '#C9DEC5',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#EEF7EA',
  },
  text: {
    color: '#486B4A',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
