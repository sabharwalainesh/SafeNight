import { Text, View } from 'react-native';
import { Btn, ListRow, Rows, Section } from '../components/ui';
import { C } from '../theme';
import { ACKNOWLEDGEMENTS, PRIVACY_POLICY, TERMS, type LegalDoc } from '../web';

export type LegalPage = 'privacy' | 'terms' | 'acknowledgements';

function Doc({ doc }: { doc: LegalDoc }) {
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 6, paddingHorizontal: 4 }}>
        <Text accessibilityRole="header" style={{ color: C.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }}>{doc.title}</Text>
        <Text style={{ color: C.muted, fontSize: 13 }}>Last updated {doc.updated}</Text>
        <Text style={{ color: C.text, fontSize: 17, lineHeight: 24, marginTop: 6 }}>{doc.intro}</Text>
      </View>
      {doc.sections.map((sec) => (
        <Section key={sec.heading} header={sec.heading}>
          {sec.body.map((para, i) => (
            <Text key={i} style={{ color: C.text, fontSize: 16, lineHeight: 23 }}>{para}</Text>
          ))}
        </Section>
      ))}
    </View>
  );
}

export function LegalScreen({ page, onBack }: { page: LegalPage; onBack: () => void }) {
  return (
    <View style={{ gap: 16 }}>
      <Btn title="‹ Back" variant="ghost" small onPress={onBack} style={{ alignSelf: 'flex-start', paddingHorizontal: 4 }} />
      {page === 'privacy' && <Doc doc={PRIVACY_POLICY} />}
      {page === 'terms' && <Doc doc={TERMS} />}
      {page === 'acknowledgements' && (
        <Section header="Acknowledgements" flush>
          <Rows>{ACKNOWLEDGEMENTS.map((a) => <ListRow key={a} title={a} />)}</Rows>
        </Section>
      )}
    </View>
  );
}
