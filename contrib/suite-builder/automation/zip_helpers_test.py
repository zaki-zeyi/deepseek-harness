import io,unittest,zipfile
from zip_helpers import write_alias,resolve_alias

class RuntimeAliases(unittest.TestCase):
    def archive(self,aliases):
        buffer=io.BytesIO()
        with zipfile.ZipFile(buffer,'w') as z:
            z.writestr('Resources/native/tool',b'native executable')
            for name,target in aliases.items():write_alias(z,name,target)
        return zipfile.ZipFile(buffer)

    def test_relative_alias_keeps_canonical_payload(self):
        with self.archive({'Resources/bin/tool':'../native/tool'}) as z:
            name=resolve_alias(z,'Resources/bin/tool','Resources/')
            self.assertEqual(z.read(name),b'native executable')
            self.assertEqual((z.getinfo('Resources/bin/tool').external_attr>>16)&0o170000,0o120000)
            self.assertEqual(sum(i.file_size for i in z.infolist() if (i.external_attr>>16)&0o170000!=0o120000),len(b'native executable'))

    def test_missing_target_is_rejected(self):
        with self.archive({'Resources/bin/tool':'../missing'}) as z:
            with self.assertRaises(KeyError):resolve_alias(z,'Resources/bin/tool','Resources/')

    def test_escape_absolute_and_cycle_are_rejected(self):
        for target in ['../../outside','/outside','tool']:
            with self.subTest(target=target),self.archive({'Resources/bin/tool':target}) as z:
                with self.assertRaises(RuntimeError):resolve_alias(z,'Resources/bin/tool','Resources/')

if __name__=='__main__':unittest.main()
